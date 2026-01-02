import React, { createContext, useContext, useState, ReactNode } from 'react';

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
    gameDetails?: {
      date: string;
      time: string;
      location: string;
      host: string;
    };
  }) => void;
  updateTicketStatus: (ticketId: string, status: 'accepted' | 'rejected') => void;
  getPendingTickets: () => GameTicket[];
}

const GameTicketsContext = createContext<GameTicketsContextType | undefined>(undefined);

export function GameTicketsProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<GameTicket[]>([]);

  const requestJoinGame = (gameData: {
    gameId: string;
    gameTitle: string;
    gameDetails?: {
      date: string;
      time: string;
      location: string;
      host: string;
    };
  }) => {
    const newTicket: GameTicket = {
      id: Date.now().toString(),
      gameId: gameData.gameId,
      gameTitle: gameData.gameTitle,
      status: 'pending',
      requestedAt: new Date(),
      userId: 'current-user', 
      userName: 'You',
      userAvatar: 'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60',
      gameDetails: gameData.gameDetails,
    };
    setTickets(prev => [newTicket, ...prev]);
  };

  const updateTicketStatus = (ticketId: string, status: 'accepted' | 'rejected') => {
    setTickets(prev => 
      prev.map(ticket => 
        ticket.id === ticketId ? { ...ticket, status } : ticket
      )
    );
  };

  const getPendingTickets = () => {
    return tickets.filter(ticket => ticket.status === 'pending');
  };

  return (
    <GameTicketsContext.Provider value={{
      tickets,
      requestJoinGame,
      updateTicketStatus,
      getPendingTickets,
    }}>
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
