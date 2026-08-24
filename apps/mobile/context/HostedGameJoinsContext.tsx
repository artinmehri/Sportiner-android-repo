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
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  countUnseenHostedJoins,
  loadGamesTabSeenAt,
  saveGamesTabSeenAt,
} from '@/lib/hostedGameJoins';

type HostedGameJoinsContextValue = {
  joinBadgeCount: number;
  refreshJoinBadge: () => Promise<void>;
  markGamesTabSeen: () => Promise<void>;
  setGamesTabFocused: (focused: boolean) => void;
};

const HostedGameJoinsContext = createContext<HostedGameJoinsContextValue | undefined>(
  undefined,
);

export function HostedGameJoinsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [joinBadgeCount, setJoinBadgeCount] = useState(0);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const seenAtRef = useRef<string | null>(null);
  const gamesTabFocusedRef = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    seenAtRef.current = seenAt;
  }, [seenAt]);

  const refreshJoinBadge = useCallback(async () => {
    if (!isSupabaseConfigured || !user?.id) {
      setJoinBadgeCount(0);
      return;
    }

    if (gamesTabFocusedRef.current) {
      setJoinBadgeCount(0);
      return;
    }

    const cursor = seenAtRef.current;
    const { data: hostedGames, error: hostedError } = await supabase
      .from('games')
      .select('id')
      .eq('host_id', user.id)
      .gte('time', new Date().toISOString());

    if (hostedError) {
      console.warn('[HostedGameJoins] Failed to load hosted games', hostedError.message);
      return;
    }

    const hostedIds = (hostedGames ?? []).map((game: { id: string }) => game.id);
    if (hostedIds.length === 0) {
      setJoinBadgeCount(0);
      return;
    }

    let query = supabase
      .from('game_players')
      .select('user_id, joined_at')
      .in('game_id', hostedIds)
      .neq('user_id', user.id)
      .eq('role', 'member');

    if (cursor) {
      query = query.gt('joined_at', cursor);
    }

    const { data: joins, error: joinsError } = await query;
    if (joinsError) {
      console.warn('[HostedGameJoins] Failed to load joins', joinsError.message);
      return;
    }

    setJoinBadgeCount(
      countUnseenHostedJoins(joins ?? [], user.id, cursor),
    );
  }, [user?.id]);

  const markGamesTabSeen = useCallback(async () => {
    if (!user?.id) {
      setJoinBadgeCount(0);
      return;
    }

    const now = new Date().toISOString();
    seenAtRef.current = now;
    setSeenAt(now);
    setJoinBadgeCount(0);
    await saveGamesTabSeenAt(user.id, now);
  }, [user?.id]);

  const setGamesTabFocused = useCallback((focused: boolean) => {
    gamesTabFocusedRef.current = focused;
    if (focused) {
      void markGamesTabSeen();
    }
  }, [markGamesTabSeen]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user?.id) {
        setSeenAt(null);
        setJoinBadgeCount(0);
        return;
      }

      const stored = await loadGamesTabSeenAt(user.id);
      if (cancelled) return;

      if (stored) {
        seenAtRef.current = stored;
        setSeenAt(stored);
      } else {
        // First launch: seed the cursor so historical roster rows do not badge.
        const now = new Date().toISOString();
        seenAtRef.current = now;
        setSeenAt(now);
        await saveGamesTabSeenAt(user.id, now);
      }

      if (!cancelled) {
        await refreshJoinBadge();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshJoinBadge, user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) {
      return;
    }

    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        if (gamesTabFocusedRef.current) {
          void markGamesTabSeen();
          return;
        }
        void refreshJoinBadge();
      }, 150);
    };

    const channel = supabase
      .channel(`hosted-game-joins:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_players' },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [markGamesTabSeen, refreshJoinBadge, user?.id]);

  const value = useMemo(
    () => ({
      joinBadgeCount,
      refreshJoinBadge,
      markGamesTabSeen,
      setGamesTabFocused,
    }),
    [joinBadgeCount, markGamesTabSeen, refreshJoinBadge, setGamesTabFocused],
  );

  return (
    <HostedGameJoinsContext.Provider value={value}>
      {children}
    </HostedGameJoinsContext.Provider>
  );
}

export function useHostedGameJoins(): HostedGameJoinsContextValue {
  const context = useContext(HostedGameJoinsContext);
  if (!context) {
    throw new Error('useHostedGameJoins must be used within a HostedGameJoinsProvider');
  }
  return context;
}
