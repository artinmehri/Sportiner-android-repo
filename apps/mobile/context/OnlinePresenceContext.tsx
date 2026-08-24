import { supabase } from '@/context/AuthContext';
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type PresencePayload = {
  user_id?: string;
  online_at?: string;
};

type OnlinePresenceValue = {
  isUserOnline: (userId: string | null | undefined) => boolean;
};

const OnlinePresenceContext = createContext<OnlinePresenceValue>({
  isUserOnline: () => false,
});

function onlineUsersFromState(state: Record<string, PresencePayload[]>): Set<string> {
  const onlineUserIds = new Set<string>();

  Object.values(state).forEach((presences) => {
    presences.forEach((presence) => {
      if (presence.user_id) onlineUserIds.add(presence.user_id);
    });
  });

  return onlineUserIds;
}

export function OnlinePresenceProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | null;
}) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      setOnlineUserIds(new Set());
      return;
    }

    let mounted = true;
    let appState: AppStateStatus = AppState.currentState;
    const channel = supabase.channel('online-users:v1');

    const syncPresence = () => {
      if (!mounted) return;
      const state = channel.presenceState() as Record<string, PresencePayload[]>;
      setOnlineUserIds(onlineUsersFromState(state));
    };

    const trackCurrentUser = async () => {
      if (!mounted || appState !== 'active') return;
      await channel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
      });
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void trackCurrentUser();
      });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      appState = nextState;
      if (nextState === 'active') {
        void trackCurrentUser();
      } else {
        void channel.untrack();
      }
    });

    return () => {
      mounted = false;
      appStateSubscription.remove();
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const isUserOnline = useCallback(
    (candidateUserId: string | null | undefined) =>
      Boolean(candidateUserId && onlineUserIds.has(candidateUserId)),
    [onlineUserIds]
  );

  const value = useMemo(() => ({ isUserOnline }), [isUserOnline]);

  return (
    <OnlinePresenceContext.Provider value={value}>
      {children}
    </OnlinePresenceContext.Provider>
  );
}

export function useOnlinePresence(): OnlinePresenceValue {
  return useContext(OnlinePresenceContext);
}
