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
  resolveCourtType,
  resolveGameType,
  resolveIsBooked,
  resolveIsPaid,
  resolveJoinSetting,
  resolveLocationName,
  resolvePayment_amount,
  resolvePlayerCount,
  type GameRow,
  type JoinResult,
  type PlayerCounts,
  type UserRow,
} from '@/lib/gamesDb';
import { appendGameMeta, combineDateAndTimeToIso, parseGameMeta, type GameMeta } from '@/lib/gameMeta';
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
  location_name: string;
  locationCoords?: { lat: number; lng: number } | null;
  courtType: CourtType;
  isBooked: boolean;
  numberOfPlayers: number;
  playerCount: number;
  gameDescription: string;
  isPaid: boolean;
  payment_amount?: string;
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
  image?: string | null;
}

export type GameInsert = Omit<Game, 'id' | 'host' | 'hostId' | 'statuses' | 'players' | 'playerCount' | 'chatId'> & {
  locationCoords?: { lat: number; lng: number } | null;
};

export type GeoCoords = {
  lat: number;
  lng: number;
};

interface GameContextType {
  games: Game[];
  joinedGameIds: string[];
  pendingGameIds: string[];
  isLoading: boolean;
  error: string | null;
  refreshGames: () => Promise<void>;
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


export function getDistanceKm(from: GeoCoords, to: GeoCoords): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371; // Earth's radius in km
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}


export function formatGameSubtitle(row: GameRow | null | undefined): string {
  console.log(row)
  if (!row) return '';
  const location = resolveLocationName(row);
  const gameDate = row.time ? new Date(row.time) : new Date();
  const day = gameDate.toLocaleDateString(undefined, { weekday: 'short' }) ?? '';
  const time = gameDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }) ?? '';
  const schedule = [day, time].filter(Boolean).join(' · ');
  if (schedule && location) return `${schedule} @ ${location}`;
  return schedule || location;
}


function rowToGame(row: GameRow, host: UserRow | null | undefined, counts: PlayerCounts): Game {
  const { cleanDescription, meta } = parseGameMeta(row.description ?? '');
  const skillLevel = (row.level as SkillLevel) ?? 'Beginner';
  const capacity = row.number_of_players ?? row.capacity ?? 2;
  const playerCount = resolvePlayerCount(row, counts);
  const spotsLeft = Math.max(0, capacity - playerCount);
  const gameType = resolveGameType(row) as GameType;
  const joinSetting = resolveJoinSetting(row) as JoinSetting;
  const courtType = resolveCourtType(row) as CourtType;
  const isBooked = resolveIsBooked(row);
  const isPaid = resolveIsPaid(row);
  const payment_amount = resolvePayment_amount(row);
  const location = resolveLocationName(row);

  // Parse location coordinates from row.location_cords
  let locationCoords: { lat: number; lng: number } | null = null;
  if (row.location_cords) {
    if (typeof row.location_cords === 'string') {
      // Check if it's WKB hex format (starts with hex digits like 01)
      if (/^[0-9a-fA-F]+$/.test(row.location_cords) && row.location_cords.length >= 40) {
        // Parse EWKB hex format
        const hex = row.location_cords;
        // Convert hex to byte array
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
        }
        
        const view = new DataView(bytes.buffer);
        const byteOrder = view.getUint8(0); // 0 = big-endian, 1 = little-endian
        const littleEndian = byteOrder === 1;
        
        // Geometry type at offset 1 (4 bytes)
        const geomType = view.getUint32(1, littleEndian);
        
        // Check if SRID is present (bit 0x20000000 set in type)
        const hasSrid = (geomType & 0x20000000) !== 0;
        
        let offset = 5; // After byte order and type
        if (hasSrid) {
          offset += 4; // Skip SRID (4 bytes)
        }
        
        // Read X and Y coordinates (8 bytes each, double precision)
        const x = view.getFloat64(offset, littleEndian);
        const y = view.getFloat64(offset + 8, littleEndian);
        
        locationCoords = { lng: x, lat: y };
      } else {
        // Parse PostGIS POINT string format: "POINT(lng lat)"
        const match = row.location_cords.match(/POINT\s*\(([-\d.]+)\s+([-\d.]+)\)/i);
        if (match) {
          locationCoords = { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
        }
      }
    } else if (typeof row.location_cords === 'object' && 'coordinates' in row.location_cords) {
      // Handle GeoJSON format
      const coords = row.location_cords.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        locationCoords = { lng: coords[0], lat: coords[1] };
      }
    }
  }

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
    location_name: location,
    locationCoords,
    courtType,
    isBooked,
    numberOfPlayers: row.number_of_players ?? row.capacity ?? 2,
    playerCount,
    gameDescription: cleanDescription,
    isPaid,
    payment_amount,
    chatId: row.chat_id ?? undefined,
    host: {
      name: host?.name ?? 'Host',
      avatar: host?.profile_picture ?? DEFAULT_AVATAR,
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
    cost: isPaid && payment_amount ? `$${payment_amount} Entry` : 'Free',
    image: row.image ?? null,
  };
}

export async function addGame( 
  host_id: any,
  title: string,
  description: string,
  type: string,
  location_cords: any,
  time: any,
  location_name: string,
  level: string,
  is_public: any,
  game_capacity: number,
  is_booked: boolean,
  payment_amount: number,
  image: string,
  court_type: string,
  is_paid: boolean,
  players_enrolled: number) {

    const {data, error} = await supabase.from('games').insert({
      host_id,
      title,
      description,
      type,
      location_cords,
      time,
      location_name,
      level,
      is_public,
      game_capacity,
      is_booked,
      payment_amount,
      image,
      court_type,
      is_paid,
      players_enrolled
    }).select().single()

    if (error) {
      console.log('error while adding game to the database')
      console.log(error?.message)
    }
    return data
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

export function isGameInTimeFilter(
  gameDateIso: string,
  filter: "Today" | "Tomorrow" | "This Weekend"
): boolean {
  if (!gameDateIso) return false;

  const gameDate = new Date(gameDateIso);

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (filter === "Today") {
    return isSameDay(gameDate, today);
  }

  if (filter === "Tomorrow") {
    return isSameDay(gameDate, tomorrow);
  }

  if (filter === "This Weekend") {
    const current = new Date(today);
    const day = current.getDay(); // 0 Sun, 6 Sat

    const daysUntilSaturday = (6 - day + 7) % 7;

    const saturday = new Date(current);
    saturday.setDate(current.getDate() + daysUntilSaturday);

    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);

    return isSameDay(gameDate, saturday) || isSameDay(gameDate, sunday);
  }

  return true;
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

  const createGame = useCallback(async (gameData: GameInsert): Promise<Game> => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      throw new Error('Sign in to create a game.');
    }

    const playerCount = gameData.gameType === '1v1' ? 2 : gameData.numberOfPlayers;
    const normalized = { ...gameData, numberOfPlayers: playerCount };

    const inserted = await createGameRow(userData.user.id, {
      title: gameData.title,
      gameDescription: gameData.gameDescription,
      gameType: gameData.gameType,
      skillLevel: gameData.skillLevel,
      joinSetting: gameData.joinSetting,
      courtType: gameData.courtType,
      isBooked: gameData.isBooked,
      isPaid: gameData.isPaid,
      payment_amount: gameData.payment_amount,
      location_name: gameData.location_name,
      locationCoords: gameData.locationCoords,
      date: gameData.date,
      time: gameData.time,
      numberOfPlayers: normalized.numberOfPlayers,
    });

    const { data: host } = await supabase
      .from('users')
      .select('id, name, profile_picture')
      .eq('id', userData.user.id)
      .single();

    const counts = await fetchPlayerCounts([inserted.id]);
    return rowToGame(inserted, host as UserRow, counts);
  }, []);

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