import React, { createContext, useCallback, useContext, useState, ReactNode } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface GameTicket {
  id: string;
  gameId: string;
  gameTitle: string;
  status: 'pending' | 'accepted' | 'rejected';
  requestedAt: Date;
  userId: string;
  userName: string;
  userAvatar: string;
  gameDetails?: {
    date: string;
    time: string;
    location: string;
    host: string;
  };
}

interface GameTicketsContextType {
  tickets: GameTicket[];
  requestJoinGame: (gameData: {
    gameId: string;
    gameTitle: string;
    gameStatus?: string;
    gameDetails?: {
      date: string;
      time: string;
      location: string;
      host: string;
    };
  }) => Promise<{ error: string | null }>;
  updateTicketStatus: (ticketId: string, status: 'accepted' | 'rejected') => void;
  getPendingTickets: () => GameTicket[];
}

const GameTicketsContext = createContext<GameTicketsContextType | undefined>(undefined);

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60';

export function GameTicketsProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<GameTicket[]>([]);

  const requestJoinGame = useCallback(
    async (gameData: {
      gameId: string;
      gameTitle: string;
      gameStatus?: string;
      gameDetails?: {
        date: string;
        time: string;
        location: string;
        host: string;
      };
    }): Promise<{ error: string | null }> => {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          gameData.gameId
        );

      if (!isSupabaseConfigured || !isUuid) {
        const newTicket: GameTicket = {
          id: String(Date.now()),
          gameId: gameData.gameId,
          gameTitle: gameData.gameTitle,
          status: 'pending',
          requestedAt: new Date(),
          userId: 'current-user',
          userName: 'You',
          userAvatar: DEFAULT_AVATAR,
          gameDetails: gameData.gameDetails,
        };
        setTickets((prev) => [newTicket, ...prev]);
        return {
          error: isUuid && !isSupabaseConfigured
            ? 'Configure Supabase env vars to sync join requests.'
            : null,
        };
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        return { error: 'Sign in to request a spot.' };
      }

      const { data: inserted, error: insErr } = await supabase
        .from('game_requests')
        .insert({
          game_id: gameData.gameId,
          user_id: userData.user.id,
          status: 'pending',
        })
        .select('id')
        .single();

      if (insErr) {
        if (insErr.code === '23505') {
          return { error: 'You already requested this game.' };
        }
        return { error: insErr.message };
      }

      const { data: profile } = await supabase
        .from('users')
        .select('name')
        .eq('id', userData.user.id)
        .maybeSingle();

      const newTicket: GameTicket = {
        id: inserted?.id ?? String(Date.now()),
        gameId: gameData.gameId,
        gameTitle: gameData.gameTitle,
        status: 'pending',
        requestedAt: new Date(),
        userId: userData.user.id,
        userName: profile?.name ?? 'You',
        userAvatar: DEFAULT_AVATAR,
        gameDetails: gameData.gameDetails,
      };
      setTickets((prev) => [newTicket, ...prev]);
      return { error: null };
    },
    []
  );

  const updateTicketStatus = (ticketId: string, status: 'accepted' | 'rejected') => {
    setTickets((prev) =>
      prev.map((ticket) => (ticket.id === ticketId ? { ...ticket, status } : ticket))
    );
  };

  const getPendingTickets = () => tickets.filter((ticket) => ticket.status === 'pending');

  return (
    <GameTicketsContext.Provider
      value={{
        tickets,
        requestJoinGame,
        updateTicketStatus,
        getPendingTickets,
      }}
    >
      {children}
    </GameTicketsContext.Provider>
  );
}

export function useGameTickets() {
  const context = useContext(GameTicketsContext);
  if (context === undefined) {
    throw new Error('useGameTickets must be used within a GameTicketsProvider');
  }
  return context;
}
