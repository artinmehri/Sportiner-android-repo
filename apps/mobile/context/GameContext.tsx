import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
  createGameRow,
  fetchAllGameRows,
  fetchGameRowsForHost,
  fetchHostProfiles,
  fetchPastGamesForUser,
  fetchPendingRequestsForHost,
  fetchPlayerCounts,
  fetchUpcomingGameRowsForPlayer,
  fetchUserGameMembership,
  joinGame as joinGameDb,
  resolveCleanDescription,
  resolveCourtType,
  resolveGameType,
  resolveIsBooked,
  resolveIsPaid,
  resolveJoinSetting,
  resolveLocationName,
  resolvePaymentAmount,
  resolvePlayerCount,
  type GameRow,
  type JoinResult,
  type PlayerCounts,
  type UserRow,
} from '@/lib/gamesDb';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type { JoinResult, GameRow };

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
  playerCount: number;
  gameDescription: string;
  isPaid: boolean;
  paymentAmount?: string;
  chatId?: string;
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

export type GameInsert = Omit<Game, 'id' | 'host' | 'hostId' | 'statuses' | 'players' | 'playerCount' | 'chatId'> & {
  locationCoords?: { lat: number; lng: number } | null;
};

interface GameContextType {
  games: Game[];
  joinedGameIds: string[];
  pendingGameIds: string[];
  isLoading: boolean;
  error: string | null;
  refreshGames: () => Promise<void>;
  refreshMembership: () => Promise<void>;
  addGame: (game: GameInsert) => Promise<Game>;
  getGameById: (id: string) => Game | undefined;
  getAllGames: () => Promise<Game[]>;
  getMyGames: () => Promise<Game[]>;
  getMyPlayingGames: () => Promise<Game[]>;
  getPastGames: () => Promise<{ hosted: Game[]; played: Game[] }>;
  createGame: (gameData: GameInsert) => Promise<Game>;
  joinGame: (gameId: string) => Promise<JoinResult>;
  requestToJoin: (gameId: string) => Promise<string>;
  getIncomingRequests: () => Promise<Array<{
    game_id: string;
    game_title: string;
    requester_user_id: string;
    status: string;
  }>>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function formatGameSubtitle(row: GameRow | null | undefined): string {
  if (!row) {
    return '';
  }
  const location = resolveLocationName(row);
  const when = row.time ? new Date(row.time) : null;
  const day = when?.toLocaleDateString(undefined, { weekday: 'short' }) ?? '';
  const time =
    when?.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }) ?? '';
  const schedule = [day, time].filter(Boolean).join(' · ');
  if (schedule && location) {
    return `${schedule} @ ${location}`;
  }
  return schedule || location;
}

function rowToGame(row: GameRow, host: UserRow | null | undefined, counts: PlayerCounts): Game {
  const skillLevel = (row.level as SkillLevel) ?? 'Beginner';
  const capacity = row.number_of_players ?? row.capacity ?? 2;
  const playerCount = resolvePlayerCount(row, counts);
  const spotsLeft = Math.max(0, capacity - playerCount);
  const gameType = resolveGameType(row) as GameType;
  const joinSetting = resolveJoinSetting(row) as JoinSetting;
  const courtType = resolveCourtType(row) as CourtType;
  const isBooked = resolveIsBooked(row);
  const isPaid = resolveIsPaid(row);
  const paymentAmount = resolvePaymentAmount(row);
  const location = resolveLocationName(row);

  const t = row.time ? new Date(row.time) : new Date();
  const dateIso = row.time ?? '';
  const timeStr = row.time
    ? `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    : '';

  const spotStatus =
    spotsLeft === 0
      ? {
          type: 'full' as const,
          label: 'Full',
          color: '#FF3B30',
          backgroundcolor: 'rgba(255, 59, 48, 0.15)',
          icon: 'person',
        }
      : {
          type: 'spots' as const,
          label: `${spotsLeft} Left`,
          color: '#FF9500',
          backgroundcolor: 'rgba(255, 179, 71, 0.2)',
          icon: 'person',
        };

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
    numberOfPlayers: capacity,
    playerCount,
    gameDescription: resolveCleanDescription(row),
    isPaid,
    paymentAmount,
    chatId: row.chat_id ?? undefined,
    host: {
      name: host?.name ?? 'Host',
      avatar: DEFAULT_AVATAR,
    },
    statuses: [
      spotStatus,
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

async function mapRowsToGames(rows: GameRow[]): Promise<Game[]> {
  const hostIds = [...new Set(rows.map((r) => r.host_id))];
  const gameIds = rows.map((r) => r.id);
  const [profileMap, counts] = await Promise.all([
    fetchHostProfiles(hostIds),
    fetchPlayerCounts(gameIds),
  ]);
  return rows.map((r) => rowToGame(r, profileMap[r.host_id], counts));
}

function toInsertPayload(gameData: GameInsert) {
  return {
    title: gameData.title,
    gameDescription: gameData.gameDescription,
    gameType: gameData.gameType,
    skillLevel: gameData.skillLevel,
    joinSetting: gameData.joinSetting,
    courtType: gameData.courtType,
    isBooked: gameData.isBooked,
    isPaid: gameData.isPaid,
    paymentAmount: gameData.paymentAmount,
    locationName: gameData.location,
    locationCoords: gameData.locationCoords ?? null,
    date: gameData.date,
    time: gameData.time,
    numberOfPlayers: gameData.numberOfPlayers,
  };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const authUserId = session?.user?.id ?? null;
  const [games, setGames] = useState<Game[]>([]);
  const [joinedGameIds, setJoinedGameIds] = useState<string[]>([]);
  const [pendingGameIds, setPendingGameIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshMembership = useCallback(async () => {
    if (!isSupabaseConfigured || !authUserId) {
      setJoinedGameIds([]);
      setPendingGameIds([]);
      return;
    }
    const membership = await fetchUserGameMembership(authUserId);
    setJoinedGameIds(membership.joinedGameIds);
    setPendingGameIds(membership.pendingGameIds);
  }, [authUserId]);

  const refreshGames = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setGames([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const rows = await fetchAllGameRows();
      const mapped = await mapRowsToGames(rows);
      setGames(mapped);
      await refreshMembership();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
      setGames([]);
    } finally {
      setIsLoading(false);
    }
  }, [refreshMembership]);

  useEffect(() => {
    refreshGames();
  }, [refreshGames, authUserId]);

  const addGame = useCallback(
    async (gameData: GameInsert): Promise<Game> => {
      const playerCount = gameData.gameType === '1v1' ? 2 : gameData.numberOfPlayers;
      const normalized = { ...gameData, numberOfPlayers: playerCount };

      if (!isSupabaseConfigured) {
        const newGame: Game = {
          ...normalized,
          id: String(Date.now()),
          hostId: 'local',
          playerCount: 1,
          host: { name: 'You', avatar: DEFAULT_AVATAR },
          statuses: [
            {
              type: 'spots',
              label: `${playerCount - 1} Left`,
              color: '#FF9500',
              backgroundcolor: 'rgba(255, 179, 71, 0.2)',
              icon: 'person',
            },
            {
              type: 'booked',
              label: normalized.isBooked ? 'Court booked' : 'Court TBD',
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

      const inserted = await createGameRow(userData.user.id, toInsertPayload(normalized));
      const [profileMap, counts] = await Promise.all([
        fetchHostProfiles([userData.user.id]),
        fetchPlayerCounts([inserted.id]),
      ]);
      const game = rowToGame(inserted, profileMap[userData.user.id], counts);
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
    const rows = await fetchAllGameRows();
    return mapRowsToGames(rows);
  }, []);

  const getMyGames = useCallback(async (): Promise<Game[]> => {
    if (!isSupabaseConfigured) {
      return [];
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      throw new Error('User not authenticated');
    }
    const rows = await fetchGameRowsForHost(userData.user.id);
    return mapRowsToGames(rows);
  }, []);

  const getMyPlayingGames = useCallback(async (): Promise<Game[]> => {
    if (!isSupabaseConfigured || !authUserId) {
      return [];
    }
    const rows = await fetchUpcomingGameRowsForPlayer(authUserId);
    return mapRowsToGames(rows);
  }, [authUserId]);

  const getPastGames = useCallback(async (): Promise<{ hosted: Game[]; played: Game[] }> => {
    if (!isSupabaseConfigured || !authUserId) {
      return { hosted: [], played: [] };
    }
    const { hosted, played } = await fetchPastGamesForUser(authUserId);
    const [hostedGames, playedGames] = await Promise.all([
      mapRowsToGames(hosted),
      mapRowsToGames(played),
    ]);
    return { hosted: hostedGames, played: playedGames };
  }, [authUserId]);

  const createGame = useCallback(
    async (gameData: GameInsert): Promise<Game> => addGame(gameData),
    [addGame]
  );

  const joinGame = useCallback(
    async (gameId: string): Promise<JoinResult> => {
      if (!isSupabaseConfigured) {
        return 'not_configured';
      }
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        return 'not_authenticated';
      }
      const result = await joinGameDb(gameId, userData.user.id);
      if (result === 'joined') {
        setJoinedGameIds((prev) => (prev.includes(gameId) ? prev : [...prev, gameId]));
        setPendingGameIds((prev) => prev.filter((id) => id !== gameId));
      } else if (result === 'requested') {
        setPendingGameIds((prev) => (prev.includes(gameId) ? prev : [...prev, gameId]));
      }
      await refreshGames();
      return result;
    },
    [refreshGames]
  );

  const requestToJoin = useCallback(
    async (gameId: string): Promise<string> => {
      const result = await joinGame(gameId);
      if (result === 'joined') {
        return 'joined';
      }
      if (result === 'requested') {
        return 'created';
      }
      if (result === 'already_requested') {
        return 'already_requested';
      }
      if (result === 'already_member') {
        return 'already_member';
      }
      if (result === 'full') {
        throw new Error('This game is full.');
      }
      if (result === 'not_authenticated') {
        throw new Error('User not authenticated');
      }
      throw new Error('Configure Supabase to join games.');
    },
    [joinGame]
  );

  const getIncomingRequests = useCallback(async () => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      throw new Error('User not authenticated');
    }

    const pending = await fetchPendingRequestsForHost(userData.user.id);
    return pending.map((r) => ({
      game_id: r.game_id,
      game_title: r.game_title,
      requester_user_id: r.user_id,
      status: r.status,
    }));
  }, []);

  return (
    <GameContext.Provider
      value={{
        games,
        joinedGameIds,
        pendingGameIds,
        isLoading,
        error,
        refreshGames,
        refreshMembership,
        addGame,
        getGameById,
        getAllGames,
        getMyGames,
        getMyPlayingGames,
        getPastGames,
        createGame,
        joinGame,
        requestToJoin,
        getIncomingRequests,
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
