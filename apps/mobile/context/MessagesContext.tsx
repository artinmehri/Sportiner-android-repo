import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/context/AuthContext';
import { getMessages } from '@/context/ChatContext';
import {
  mergeMessagesById,
  removeMessageById,
  upsertChatMessages,
  type ChatMessage,
  type MessagesByChat,
} from '@/lib/chatMessages';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { hydrateChatImage } from '@/lib/chatImages';

type MessagesContextValue = {
  messagesByChat: MessagesByChat;
  loadChat: (chatId: string) => Promise<void>;
  upsertMessages: (chatId: string, rows: ChatMessage[]) => void;
  patchMessage: (chatId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  dropMessage: (chatId: string, messageId: string) => void;
  dropMessagesFromSender: (chatId: string, senderId: string) => void;
};

const MessagesContext = createContext<MessagesContextValue | undefined>(undefined);

/**
 * Single source of truth for conversation history, keyed by chat id, fed by one
 * app-wide Realtime subscription. A screen reads the bucket for its own chat, so
 * one conversation's messages can never be rendered inside another.
 *
 * ponytail: the cache is in memory and unbounded, so it holds every conversation
 * opened this session and is empty again after a cold start. An on-device store
 * (SQLite) is the upgrade path if history size or offline reads start to matter.
 */
export function MessagesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [messagesByChat, setMessagesByChat] = useState<MessagesByChat>({});

  // Realtime rows are only applied to conversations already in the cache, so a
  // chat that was never opened cannot render a one-message partial history.
  const loadedChats = useRef(new Set<string>());
  const inFlightLoads = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    loadedChats.current = new Set();
    inFlightLoads.current = new Map();
    setMessagesByChat({});
  }, [user?.id]);

  const upsertMessages = useCallback((chatId: string, rows: ChatMessage[]) => {
    if (!chatId || rows.length === 0) return;
    setMessagesByChat((current) => upsertChatMessages(current, chatId, rows));
  }, []);

  const patchMessage = useCallback(
    (chatId: string, messageId: string, patch: Partial<ChatMessage>) => {
      if (!chatId || !messageId) return;
      setMessagesByChat((current) => {
        const existing = current[chatId];
        if (!existing) return current;
        return {
          ...current,
          [chatId]: existing.map((message) =>
            message.id === messageId ? { ...message, ...patch } : message
          ),
        };
      });
    },
    []
  );

  const dropMessage = useCallback((chatId: string, messageId: string) => {
    if (!chatId || !messageId) return;
    setMessagesByChat((current) => {
      const existing = current[chatId];
      if (!existing) return current;
      return { ...current, [chatId]: removeMessageById(existing, messageId) };
    });
  }, []);

  const dropMessagesFromSender = useCallback((chatId: string, senderId: string) => {
    if (!chatId || !senderId) return;
    setMessagesByChat((current) => {
      const existing = current[chatId];
      if (!existing) return current;
      return {
        ...current,
        [chatId]: existing.filter((message) => message.sender_id !== senderId),
      };
    });
  }, []);

  const loadChat = useCallback(
    async (chatId: string) => {
      if (!chatId) return;

      const inFlight = inFlightLoads.current.get(chatId);
      if (inFlight) return inFlight;

      // Marked loaded before the fetch so a message arriving mid-fetch is merged
      // instead of dropped until the next time the chat is opened.
      loadedChats.current.add(chatId);

      const load = (async () => {
        try {
          const rows = (await getMessages(chatId)) as ChatMessage[] | undefined;
          setMessagesByChat((current) => ({
            ...current,
            [chatId]: mergeMessagesById(rows ?? [], current[chatId] ?? []),
          }));
        } finally {
          inFlightLoads.current.delete(chatId);
        }
      })();

      inFlightLoads.current.set(chatId, load);
      return load;
    },
    []
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return;

    const applyRow = async (row: ChatMessage | null | undefined) => {
      const chatId = row?.chat_id;
      if (!chatId || !loadedChats.current.has(chatId)) return;
      upsertMessages(chatId, [await hydrateChatImage(row)]);
    };

    // ponytail: one unfiltered channel, authorized per row by RLS. Postgres
    // Changes authorizes every event per subscriber, so if conversation volume
    // grows this should move to a server-fanned broadcast channel.
    const channel = supabase
      .channel(`chat-messages:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => void applyRow(payload.new as ChatMessage)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => void applyRow(payload.new as ChatMessage)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.old as ChatMessage | undefined;
          if (!row?.id || !row.chat_id) return;
          if (!loadedChats.current.has(row.chat_id)) return;
          dropMessage(row.chat_id, row.id);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [dropMessage, upsertMessages, user?.id]);

  const value = useMemo(
    () => ({
      messagesByChat,
      loadChat,
      upsertMessages,
      patchMessage,
      dropMessage,
      dropMessagesFromSender,
    }),
    [
      dropMessage,
      dropMessagesFromSender,
      loadChat,
      messagesByChat,
      patchMessage,
      upsertMessages,
    ]
  );

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

const EMPTY_MESSAGES: ChatMessage[] = [];

/** Conversation history for one chat, plus the actions that mutate that chat. */
export function useChatMessages(chatId: string | undefined) {
  const context = useContext(MessagesContext);
  if (!context) {
    throw new Error('useChatMessages must be used within a MessagesProvider');
  }

  const {
    messagesByChat,
    loadChat,
    upsertMessages,
    patchMessage,
    dropMessage,
    dropMessagesFromSender,
  } = context;

  const messages = (chatId && messagesByChat[chatId]) || EMPTY_MESSAGES;

  useEffect(() => {
    if (!chatId) return;
    void loadChat(chatId);
  }, [chatId, loadChat]);

  return useMemo(
    () => ({
      messages,
      upsertMessages: (rows: ChatMessage[]) => chatId && upsertMessages(chatId, rows),
      patchMessage: (messageId: string, patch: Partial<ChatMessage>) =>
        chatId && patchMessage(chatId, messageId, patch),
      dropMessage: (messageId: string) => chatId && dropMessage(chatId, messageId),
      dropMessagesFromSender: (senderId: string) =>
        chatId && dropMessagesFromSender(chatId, senderId),
    }),
    [chatId, dropMessage, dropMessagesFromSender, messages, patchMessage, upsertMessages]
  );
}
