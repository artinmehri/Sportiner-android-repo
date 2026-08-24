export type ChatMessage = {
  id?: string;
  chat_id?: string;
  sender_id: string;
  message: string;
  image?: string;
  imageUrl?: string | null;
  type: string;
  reply_to?: string;
  is_reply?: boolean;
  created_at?: string;
  updated_at?: string;
  is_edited?: boolean;
  status?: string;
};

export type ChatMessageRecord = {
  id?: string;
  created_at?: unknown;
};

export function mergeMessagesById<T extends ChatMessageRecord>(
  ...collections: T[][]
): T[] {
  const messagesById = new Map<string, T>();
  const messagesWithoutId: T[] = [];

  collections.flat().forEach((message) => {
    if (!message.id) {
      messagesWithoutId.push(message);
      return;
    }

    messagesById.set(message.id, {
      ...messagesById.get(message.id),
      ...message,
    });
  });

  return [...messagesById.values(), ...messagesWithoutId].sort((left, right) =>
    String(left.created_at ?? '').localeCompare(String(right.created_at ?? ''))
  );
}

export type MessagesByChat = Record<string, ChatMessage[]>;

/**
 * Merge rows into one conversation's bucket and leave every other conversation
 * untouched. This keying is what makes a message from chat A unable to render
 * inside chat B, so the guarantee lives here rather than in a screen.
 */
export function upsertChatMessages(
  store: MessagesByChat,
  chatId: string,
  rows: ChatMessage[],
): MessagesByChat {
  if (!chatId || rows.length === 0) {
    return store;
  }

  return {
    ...store,
    [chatId]: mergeMessagesById(store[chatId] ?? [], rows.filter(
      (row) => !row.chat_id || row.chat_id === chatId,
    )),
  };
}

export function removeMessageById<T extends { id?: string }>(
  messages: T[],
  messageId: string,
): T[] {
  return messages.filter((message) => message.id !== messageId);
}
