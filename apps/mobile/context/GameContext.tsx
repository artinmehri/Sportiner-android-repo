import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { appendGameMeta, combineDateAndTimeToIso, parseGameMeta, type GameMeta } from '@/lib/gameMeta';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type GameType = '1v1' | 'Group';
type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced';
type JoinSetting = '👥 Open to Anyone' | '✋ Request Approval';
type CourtType = 'Public' | 'Private/Club' | 'Condo';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60';

export interface Game {
  id: string;
  hostId: string;
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
    type: 'spots' | 'booked' | 'requested' | 'full' | 'verify' | 'verified';
    label: string;
    color: string;
    backgroundcolor: string;
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

export type GameInsert = Omit<Game, 'id' | 'host' | 'hostId' | 'statuses' | 'players'>;

interface GameContextType {
  games: Game[];
  isLoading: boolean;
  error: string | null;
  refreshGames: () => Promise<void>;
  addGame: (game: GameInsert) => Promise<Game>;
  getGameById: (id: string) => Game | undefined;
  getAllGames: () => Promise<Game[]>;
  getMyGames: () => Promise<Game[]>;
  createGame: (gameData: GameInsert) => Promise<Game>;
  requestToJoin: (gameId: string) => Promise<string>;
  getIncomingRequests: () => Promise<Array<{
    game_id: string;
    game_title: string;
    requester_user_id: string;
    status: string;
  }>>;
} 

const GameContext = createContext<GameContextType | undefined>(undefined);

type GeographyPoint = {
  type: 'Point';
  coordinates: [number, number]; 
};

export type GameRow = {
  id: string;
  created_at: string;
  host_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  location: GeographyPoint;
  time: string | null;
  level: string | null;
  public: boolean | null;
  capacity: number | null;
  number_of_players: number | null;
  booked: boolean;
  payment_amount: string;
  image: string;
};


export function formatGameSubtitle(row: GameRow | null | undefined): string {
  console.log(row)
  if (!row) return '';
  const { meta } = parseGameMeta(row.description ?? null);
  const location = meta?.location ?? '';
  const when = row.time ? new Date(row.time) : null;
  const day = when?.toLocaleDateString(undefined, { weekday: 'short' }) ?? '';
  const time = when?.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }) ?? '';
  const schedule = [day, time].filter(Boolean).join(' · ');
  if (schedule && location) return `${schedule} @ ${location}`;
  return schedule || location;
}


type UserRow = {
  id: string;
  name: string | null;
  profile_picture: number | null;
};


function rowToGame(row: GameRow, host?: UserRow | null): Game {
  const { cleanDescription, meta } = parseGameMeta(row.description);
  const skillLevel = (row.level as SkillLevel) ?? 'Beginner';
  const spotsLeft = Math.max(0, (row.capacity ?? 2) - 1);

  const t = row.time ? new Date(row.time) : new Date();
  const dateIso = row.time ?? '';
  const timeStr = row.time
    ? `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    : '';

  const gameType: GameType =
    meta?.gameType ?? (row.category?.trim().startsWith('1v1') ? '1v1' : 'Group');
  const joinSetting: JoinSetting =
    meta?.joinSetting ??
    (row.public !== false ? '👥 Open to Anyone' : '✋ Request Approval');
  const courtType: CourtType = meta?.courtType ?? 'Public';
  const isBooked = meta?.isBooked ?? false;
  const isPaid = meta?.isPaid ?? false;
  const paymentAmount = meta?.paymentAmount;
  const location = meta?.location ?? '';

  return {
    id: row.id,
    hostId: row.host_id,
    title: row.title ?? 'Game',
    gameType,
    skillLevel,
    joinSetting,
    date: dateIso,
    time: timeStr,
    location,
    courtType,
    isBooked,
    numberOfPlayers: row.number_of_players ?? row.capacity ?? 2,
    gameDescription: cleanDescription,
    isPaid,
    paymentAmount,
    host: {
      name: host?.name ?? 'Host',
      avatar: DEFAULT_AVATAR,
    },
    statuses: [
      {
        type: 'spots',
        label: `${spotsLeft} Left`,
        color: '#FF9500',
        backgroundcolor: 'rgba(255, 179, 71, 0.2)',
        icon: 'person',
      },
      {
        type: 'booked',
        label: isBooked ? 'Court booked' : 'Court TBD',
        color: '#19E675',
        backgroundcolor: 'rgba(255, 179, 71, 0.2)',
        icon: 'checkmark',
      },
    ],
    level: skillLevel,
    address: location,
    cost: isPaid && paymentAmount ? `$${paymentAmount} Entry` : 'Free',
  };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const authUserId = session?.user?.id ?? null;
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshGames = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setGames([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    const { data: rows, error: qErr } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false });

    if (qErr) {
      setError(qErr.message);
      setGames([]);
      setIsLoading(false);
      return;
    }

    const list = (rows ?? []) as GameRow[];
    const hostIds = [...new Set(list.map((r) => r.host_id))];
    let profileMap: Record<string, UserRow> = {};

    if (hostIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, profile_picture')
        .in('id', hostIds);
      profileMap = Object.fromEntries((users ?? []).map((p: UserRow) => [p.id, p]));
    }

    setGames(list.map((r) => rowToGame(r, profileMap[r.host_id])));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refreshGames();
  }, [refreshGames, authUserId]);

  const addGame = useCallback(
    async (gameData: GameInsert) => {
      if (!isSupabaseConfigured) {
        const newGame: Game = {
          ...gameData,
          id: String(Date.now()),
          hostId: 'local',
          host: { name: 'You', avatar: DEFAULT_AVATAR },
          statuses: [
            {
              type: 'spots',
              label: `${gameData.numberOfPlayers - 1} Left`,
              color: '#FF9500',
              backgroundcolor: 'rgba(255, 179, 71, 0.2)',
              icon: 'person',
            },
            {
              type: 'booked',
              label: 'Court booked',
              color: '#19E675',
              backgroundcolor: 'rgba(255, 179, 71, 0.2)',
              icon: 'checkmark',
            },
          ],
        };
        setGames((prev) => [newGame, ...prev]);
        return newGame;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        throw new Error('Sign in to create a game.');
      }

      const meta: GameMeta = {
        gameType: gameData.gameType,
        joinSetting: gameData.joinSetting,
        courtType: gameData.courtType,
        isBooked: gameData.isBooked,
        isPaid: gameData.isPaid,
        paymentAmount: gameData.paymentAmount,
        location: gameData.location,
      };
      const fullDescription = appendGameMeta(gameData.gameDescription, meta);
      const gameTime = combineDateAndTimeToIso(gameData.date, gameData.time);

      const row = {
        host_id: userData.user.id,
        title: gameData.title,
        description: fullDescription,
        category: `${gameData.gameType} · ${gameData.courtType}`,
        time: gameTime,
        level: gameData.skillLevel,
        public: gameData.joinSetting === '👥 Open to Anyone',
        capacity: gameData.numberOfPlayers,
        number_of_players: gameData.numberOfPlayers,
        players_list: [userData.user.id],
      };

      const { data: insertedRow, error: insErr } = await supabase
        .from('games')
        .insert(row)
        .select()
        .single();
      if (insErr) {
        throw new Error(insErr.message);
      }

      const { error: playerErr } = await supabase
      .from('game_players')
      .insert({
        game_id: insertedRow.id,
        user_id: userData.user.id,
        role: 'host',
        joined_at: new Date().toISOString(),
      });

    if (playerErr) {
      console.warn('game_players insert failed:', playerErr.message);
    }


      const { data: host } = await supabase
        .from('users')
        .select('id, name, profile_picture')
        .eq('id', userData.user.id)
        .single();

      const game = rowToGame(insertedRow as GameRow, host as UserRow);
      await refreshGames();
      return game;
    },
    [refreshGames]
  );

  const getGameById = useCallback(
    (id: string) => games.find((game) => game.id === id),
    [games]
  );

  const getAllGames = useCallback(async (): Promise<Game[]> => {
    if (!isSupabaseConfigured) {
      return [];
    }
    const { data: rows, error: qErr } = await supabase
      .from('games')
      .select('*')
      .order('time', { ascending: true });

    if (qErr) {
      throw new Error(qErr.message);
    }

    const list = (rows ?? []) as GameRow[];
    const hostIds = [...new Set(list.map((r) => r.host_id))];
    let profileMap: Record<string, UserRow> = {};

    if (hostIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, profile_picture')
        .in('id', hostIds);
      profileMap = Object.fromEntries((users ?? []).map((p: UserRow) => [p.id, p]));
    }

    return list.map((r) => rowToGame(r, profileMap[r.host_id]));
  }, []);

  const getMyGames = useCallback(async (): Promise<Game[]> => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      throw new Error('User not authenticated');
    }

    const { data: rows, error: qErr } = await supabase
      .from('games')
      .select('*')
      .eq('host_id', userData.user.id)
      .order('time', { ascending: true });

    if (qErr) {
      throw new Error(qErr.message);
    }

    const list = (rows ?? []) as GameRow[];
    const hostIds = [...new Set(list.map((r) => r.host_id))];
    let profileMap: Record<string, UserRow> = {};

    if (hostIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, profile_picture')
        .in('id', hostIds);
      profileMap = Object.fromEntries((users ?? []).map((p: UserRow) => [p.id, p]));
    }

    return list.map((r) => rowToGame(r, profileMap[r.host_id]));
  }, []);

  const createGame = useCallback(async (gameData: GameInsert): Promise<Game> => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      throw new Error('Sign in to create a game.');
    }

    const meta: GameMeta = {
      gameType: gameData.gameType,
      joinSetting: gameData.joinSetting,
      courtType: gameData.courtType,
      isBooked: gameData.isBooked,
      isPaid: gameData.isPaid,
      paymentAmount: gameData.paymentAmount,
      location: gameData.location,
    };
    const fullDescription = appendGameMeta(gameData.gameDescription, meta);
    const gameTime = combineDateAndTimeToIso(gameData.date, gameData.time);

    const row = {
      host_id: userData.user.id,
      title: gameData.title,
      description: fullDescription,
      category: `${gameData.gameType} · ${gameData.courtType}`,
      time: gameTime,
      level: gameData.skillLevel,
      public: gameData.joinSetting === '👥 Open to Anyone',
      capacity: gameData.numberOfPlayers,
      number_of_players: gameData.numberOfPlayers,
      players_list: [userData.user.id],
    };

    const { data: insertedRow, error: insErr } = await supabase
      .from('games')
      .insert(row)
      .select()
      .single();

    if (insErr) {
      throw new Error(insErr.message);
    }

    const { error: playerErr } = await supabase
    .from('game_players')
    .insert({
      game_id: insertedRow.id,
      user_id: userData.user.id,
      role: 'host',
      joined_at: new Date().toISOString(),
    });

  if (playerErr) {
    console.warn('game_players insert failed:', playerErr.message);
  }

    const { data: host } = await supabase
      .from('users')
      .select('id, name, profile_picture')
      .eq('id', userData.user.id)
      .single();

    return rowToGame(insertedRow as GameRow, host as UserRow);
  }, []);

  const requestToJoin = useCallback(async (gameId: string): Promise<string> => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      throw new Error('User not authenticated');
    }

    const { data: existingRequest } = await supabase
      .from('game_requests')
      .select('*')
      .eq('game_id', gameId)
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (existingRequest) {
      return 'already_requested';
    }

    const { error: insErr } = await supabase.from('game_requests').insert({
      game_id: gameId,
      user_id: userData.user.id,
      status: 'pending',
    });

    if (insErr) {
      throw new Error(insErr.message);
    }

    return 'created';
  }, []);

  const getIncomingRequests = useCallback(async () => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      throw new Error('User not authenticated');
    }

    const { data: hostedGames, error: gamesErr } = await supabase
      .from('games')
      .select('id')
      .eq('host_id', userData.user.id);

    if (gamesErr) {
      throw new Error(gamesErr.message);
    }

    const gameIds = (hostedGames ?? []).map((g: { id: string }) => g.id);
    if (gameIds.length === 0) {
      return [];
    }

    const { data: requests, error: reqErr } = await supabase
      .from('game_requests')
      .select('game_id, user_id, status')
      .in('game_id', gameIds);

    if (reqErr) {
      throw new Error(reqErr.message);
    }

    const { data: games } = await supabase
      .from('games')
      .select('id, title')
      .in('id', gameIds);

    const gameMap = Object.fromEntries((games ?? []).map((g: { id: string; title: string | null }) => [g.id, g.title || 'Game']));

    return (requests ?? []).map((r: { game_id: string; user_id: string; status: string }) => ({
      game_id: r.game_id,
      game_title: gameMap[r.game_id] || 'Game',
      requester_user_id: r.user_id,
      status: r.status,
    }));
  }, []);

  return (
    <GameContext.Provider
      value={{ 
        games, 
        isLoading, 
        error, 
        refreshGames, 
        addGame, 
        getGameById,
        getAllGames,
        getMyGames,
        createGame,
        requestToJoin,
        getIncomingRequests
      }}
    >
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