import React, { createContext, useCallback, useContext, useState, ReactNode } from 'react';

import { joinGame, type JoinResult } from '@/lib/gamesDb';
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
  }) => Promise<{ error: string | null; result?: JoinResult }>;
  updateTicketStatus: (ticketId: string, status: 'accepted' | 'rejected') => void;
  getPendingTickets: () => GameTicket[];
}

const GameTicketsContext = createContext<GameTicketsContextType | undefined>(undefined);

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60';

function joinResultMessage(result: JoinResult): string | null {
  switch (result) {
    case 'joined':
      return null;
    case 'requested':
      return null;
    case 'already_member':
      return 'You are already in this game.';
    case 'already_requested':
      return 'You already requested this game.';
    case 'full':
      return 'This game is full.';
    case 'not_authenticated':
      return 'Sign in to request a spot.';
    case 'not_configured':
      return 'Configure Supabase env vars to sync join requests.';
    default:
      return null;
  }
}

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
    }): Promise<{ error: string | null; result?: JoinResult }> => {
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
          result: 'requested',
        };
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        return { error: 'Sign in to request a spot.' };
      }

      const result = await joinGame(gameData.gameId, userData.user.id);
      const error = joinResultMessage(result);
      if (error) {
        return { error, result };
      }

      const { data: profile } = await supabase
        .from('users')
        .select('name')
        .eq('id', userData.user.id)
        .maybeSingle();

      const ticketStatus: GameTicket['status'] =
        result === 'joined' ? 'accepted' : 'pending';

      const newTicket: GameTicket = {
        id: `${gameData.gameId}-${userData.user.id}`,
        gameId: gameData.gameId,
        gameTitle: gameData.gameTitle,
        status: ticketStatus,
        requestedAt: new Date(),
        userId: userData.user.id,
        userName: profile?.name ?? 'You',
        userAvatar: DEFAULT_AVATAR,
        gameDetails: gameData.gameDetails,
      };

      setTickets((prev) => {
        const without = prev.filter((t) => t.gameId !== gameData.gameId);
        return [newTicket, ...without];
      });

      return { error: null, result };
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
