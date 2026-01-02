import React, { createContext, useContext, useState, ReactNode } from 'react';

type GameType = '1v1' | 'Group';
type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced';
type JoinSetting = 'Anyone can join' | 'Ask to join';
type CourtType = 'Public' | 'Private/Club' | 'Condo';

export interface Game {
  id: string;
  title: string;
  gameType: GameType;
  skillLevel: SkillLevel;
  joinSetting: JoinSetting;
  date: string;
  time: string;
  location: string;
  courtType: CourtType;
  isBooked: boolean;
  numberOfPlayers: number;
  gameDescription: string;
  isPaid: boolean;
  paymentAmount?: string;
  host: {
    name: string;
    avatar: string;
  };
  statuses?: Array<{
    type: 'spots' | 'booked' | 'pending' | 'full' | 'verify' | 'verified';
    label: string;
    color: string;
    icon: string;
  }>;
  players?: Array<{
    avatar: string;
    name?: string;
    skillLevel?: string;
  }>;
  level?: string;
  distance?: string;
  address?: string;
  cost?: string;
  avatar?: string;
}

interface GameContextType {
  games: Game[];
  addGame: (game: Omit<Game, 'id' | 'host'>) => void;
  getGameById: (id: string) => Game | undefined;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [games, setGames] = useState<Game[]>([]);

  const addGame = (gameData: Omit<Game, 'id' | 'host'>) => {
    const newGame: Game = {
      ...gameData,
      id: Date.now().toString(),
      host: {
        name: 'You',
        avatar: 'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60',
      },
      statuses: [
        { type: 'spots', label: `${gameData.numberOfPlayers - 1} Left`, color: '#FF9500', icon: 'person' },
        { type: 'booked', label: 'Court booked', color: '#19E675', icon: 'checkmark' },
      ],
    };
    setGames(prev => [newGame, ...prev]);
  };

  const getGameById = (id: string) => {
    return games.find(game => game.id === id);
  };

  return (
    <GameContext.Provider value={{ games, addGame, getGameById }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGames() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGames must be used within a GameProvider');
  }
  return context;
}
