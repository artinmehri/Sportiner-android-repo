import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { countUnreadMessages, type ConversationReadCursor } from '@/lib/unreadMessages';

type ConversationMembership = ConversationReadCursor;

type UnreadMessagesContextValue = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  markInboxRead: () => Promise<void>;
};

const UnreadMessagesContext = createContext<UnreadMessagesContextValue | undefined>(undefined);

export function UnreadMessagesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    if (!isSupabaseConfigured || !user?.id) {
      setUnreadCount(0);
      return;
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from('conversation_members')
      .select('chat_id,last_read_at')
      .eq('id', user.id);

    if (membershipsError || !memberships?.length) {
      setUnreadCount(0);
      return;
    }

    const typedMemberships = memberships as ConversationMembership[];
    const chatIds = typedMemberships.map((membership) => membership.chat_id);
    const earliestReadAt = typedMemberships
      .map((membership) => membership.last_read_at)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? '1970-01-01T00:00:00.000Z';

    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('chat_id,created_at')
      .in('chat_id', chatIds)
      .neq('sender_id', user.id)
      .gt('created_at', earliestReadAt);

    if (messagesError) {
      return;
    }

    setUnreadCount(countUnreadMessages(typedMemberships, messages ?? []));
  }, [user?.id]);

  // Keep the tab badge in sync. Do not rewrite every conversation's last_read_at
  // here — that raced with per-chat markAsRead and left inbox rows stuck unread.
  const markInboxRead = useCallback(async () => {
    await refreshUnreadCount();
  }, [refreshUnreadCount]);

  useEffect(() => {
    void refreshUnreadCount();

    if (!isSupabaseConfigured || !user?.id) {
      return;
    }

    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refreshUnreadCount();
      }, 150);
    };

    const channel = supabase
      .channel(`unread-messages:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, scheduleRefresh)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members', filter: `id=eq.${user.id}` },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [refreshUnreadCount, user?.id]);

  const value = useMemo(
    () => ({ unreadCount, refreshUnreadCount, markInboxRead }),
    [markInboxRead, unreadCount, refreshUnreadCount],
  );

  return <UnreadMessagesContext.Provider value={value}>{children}</UnreadMessagesContext.Provider>;
}

export function useUnreadMessages(): UnreadMessagesContextValue {
  const context = useContext(UnreadMessagesContext);
  if (!context) {
    throw new Error('useUnreadMessages must be used within an UnreadMessagesProvider');
  }
  return context;
}
