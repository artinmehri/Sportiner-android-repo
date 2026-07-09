import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { getCurrentUserId } from '@/context/AuthContext';
import { useAuth, getBlockedUserIds } from '@/context/AuthContext';
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
  resolveGameCapacity,
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
import { parseGameMeta } from '@/lib/gameMeta';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type { JoinResult, GameRow };

type GameType = '1v1' | 'Group';
type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced';
type JoinSetting = '👥 Open to Anyone' | '✋ Request Approval';
type CourtType = 'Public' | 'Club' | 'Condo';

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
  players_enrolled: number;
  capacity: number;
  gameDescription: string;
  isPaid: boolean;
  payment_amount?: number | null;
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

function getCutoffTime(): Date {
  return new Date(Date.now() + 2 * 60 * 60 * 1000);
}

function isPastGame(gameTime: string): boolean {
  if (!gameTime) return false;
  return new Date(gameTime) < getCutoffTime();
}

function isUpcomingGame(gameTime: string): boolean {
  if (!gameTime) return false;
  return new Date(gameTime) >= getCutoffTime();
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


export function rowToGame(row: GameRow, host: UserRow | null | undefined, counts: PlayerCounts): Game {
  const { cleanDescription, meta } = parseGameMeta(row.description ?? '');
  const skillLevel = (row.level as SkillLevel) ?? 'Beginner';
  const capacity = resolveGameCapacity(row);
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
    hostId: row.host_id ?? '',
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
    capacity: resolveGameCapacity(row),
    players_enrolled: playerCount,
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
  host_id: string,
  title: string,
  description: string,
  type: string,
  location_cords: string | null,
  time: string,
  location_name: string,
  level: string,
  is_public: boolean,
  game_capacity: number,
  is_booked: boolean,
  payment_amount: number,
  image: string,
  court_type: string,
  is_paid: boolean,
  players_enrolled: number) {

    const { data, error } = await supabase.from('games').insert({
      host_id,
      title,
      description,
      type,
      location_cords,
      time,
      location_name,
      level,
      is_public,
      game_capacity: type === '1v1' ? 2 : game_capacity,
      is_booked,
      payment_amount,
      image,
      court_type,
      is_paid,
      players_enrolled: Math.max(1, players_enrolled),
    }).select().single();

    if (error) {
      console.log('error while adding game to the database');
      console.log(error.message);
      return null;
    }

    if (data?.id && host_id) {
      const { error: playerErr } = await supabase.from('game_players').insert({
        game_id: data.id,
        user_id: host_id,
        role: 'host',
      });

      if (playerErr && playerErr.code !== '23505') {
        console.log('error while adding host to game_players');
        console.log(playerErr.message);
      }
    }

    return data;
}

export async function suggestedGames() {

}

async function mapRowsToGames(rows: GameRow[]): Promise<Game[]> {
  const hostIds = [...new Set(rows.map((r) => r.host_id).filter(Boolean))] as string[];
  const gameIds = rows.map((r) => r.id);
  const [profileMap, counts] = await Promise.all([
    fetchHostProfiles(hostIds),
    fetchPlayerCounts(gameIds),
  ]);
  return rows.map((r) => rowToGame(r, r.host_id ? profileMap[r.host_id] : undefined, counts));
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
      
      const blockedUserIds = await getBlockedUserIds();
      const filteredGames = mapped.filter(game => !blockedUserIds.includes(game.hostId));
      
      setGames(filteredGames);
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
    const games = await mapRowsToGames(rows);

    return games.filter((g) => isUpcomingGame(g.date));
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
    return {
      hosted: hostedGames.filter((g) => isPastGame(g.date)),
      played: playedGames.filter((g) => isPastGame(g.date)),
    };
  }, [authUserId]);

  const createGame = useCallback(async (gameData: any): Promise<Game> => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      throw new Error('Sign in to create a game.');
    }

    const playerCount = gameData.gameType === '1v1' ? 2 : gameData.capacity;
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
      if (result === 'not_found') {
        throw new Error('This game is no longer available.');
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
        joinGame,
        requestToJoin,
        getIncomingRequests,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export async function gameVerified(gameId: string, playerId: string) {
  const { data: member, error } = await supabase
    .from('game_players')
    .select('game_verified')
    .eq('game_id', gameId)
    .eq('user_id', playerId)
    .maybeSingle();

  if (error) {
    console.log(error.message);
    return false;
  }

  return member?.game_verified || false;
}

export async function getClosestOpenGames() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .gt('time', oneHourAgo)
    .order('time', { ascending: true });

  if (error) {
    console.log('Error fetching closest games:', error.message);
    return [];
  }

  if (!data) return [];

  const openGames = data.filter((game: { players_enrolled: any; game_capacity: any; time: any; }) => {
    const enrolled = game.players_enrolled;
    const capacity = game.game_capacity;

    if (!game.time) return false;

    return enrolled < capacity;
  });

  return openGames.slice(0, 2);
}

// Checking if the user is already in game
export async function userInGame(gameId: string) {
  if (!gameId) return false;

  const userId = await getCurrentUserId();

  if (!userId) return false;

  const { data: member, error } = await supabase
      .from('game_players')
      .select('id')
      .eq('game_id', gameId)
      .eq('user_id', userId.id)
      .maybeSingle();

      if (error) {
          console.log(error.message)
          return false
      }

      if (member === null) {
          console.log('returned null!')
          return false
      }
      return !!member;
}

export async function deleteGame(gameId: string) {
  if (!gameId) return false;

  try {
    const user = await getCurrentUserId();

    if (!user?.id) {
      console.log('Error deleting game: missing current user');
      return false;
    }

    const { data: game, error: gameLookupError } = await supabase
      .from('games')
      .select('id, host_id, chat_id')
      .eq('id', gameId)
      .maybeSingle();

    if (gameLookupError) {
      console.log('Error checking hosted game before delete:', gameLookupError.message, gameLookupError.code);
      return false;
    }

    if (!game || game.host_id !== user.id) {
      console.log('Error deleting game: current user is not the host');
      return false;
    }

    const { data: chats, error: chatLookupError } = await supabase
      .from('chat')
      .select('id')
      .eq('game_id', gameId);

    if (chatLookupError) {
      console.log('Error finding game chats before delete:', chatLookupError.message, chatLookupError.code);
      return false;
    }

    const chatIds = Array.from(
      new Set(
        [
          game.chat_id,
          ...((chats ?? []).map((chat: { id: string | null }) => chat.id)),
        ].filter(Boolean) as string[]
      )
    );

    if (chatIds.length > 0) {
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .in('chat_id', chatIds);

      if (messagesError) {
        console.log('Error deleting game chat messages:', messagesError.message, messagesError.code);
        return false;
      }

      const { error: membersByChatError } = await supabase
        .from('conversation_members')
        .delete()
        .in('chat_id', chatIds);

      if (membersByChatError) {
        console.log('Error deleting game chat members:', membersByChatError.message, membersByChatError.code);
        return false;
      }
    }

    const { error: membersByGameError } = await supabase
      .from('conversation_members')
      .delete()
      .eq('game_id', gameId);

    if (membersByGameError) {
      console.log('Error deleting game conversation members:', membersByGameError.message, membersByGameError.code);
      return false;
    }

    const { error: requestsError } = await supabase
      .from('game_requests')
      .delete()
      .eq('game_id', gameId);

    if (requestsError) {
      console.log('Error deleting game requests:', requestsError.message, requestsError.code);
      return false;
    }

    const { error: clearGameChatError } = await supabase
      .from('games')
      .update({ chat_id: null })
      .eq('id', gameId)
      .eq('host_id', user.id);

    if (clearGameChatError) {
      console.log('Error clearing game chat reference:', clearGameChatError.message, clearGameChatError.code);
      return false;
    }

    if (chatIds.length > 0) {
      const { error: chatByIdError } = await supabase
        .from('chat')
        .delete()
        .in('id', chatIds);

      if (chatByIdError) {
        console.log('Error deleting game chats by id:', chatByIdError.message, chatByIdError.code);
        return false;
      }
    }

    const { error: chatByGameError } = await supabase
      .from('chat')
      .delete()
      .eq('game_id', gameId);

    if (chatByGameError) {
      console.log('Error deleting game chats by game id:', chatByGameError.message, chatByGameError.code);
      return false;
    }

    const { error: playersError } = await supabase
      .from('game_players')
      .delete()
      .eq('game_id', gameId);

    if (playersError) {
      console.log('Error deleting game players:', playersError.message, playersError.code);
      return false;
    }

    const { error: gameError } = await supabase
      .from('games')
      .delete()
      .eq('id', gameId)
      .eq('host_id', user.id);

    if (gameError) {
      console.log('Error deleting game:', gameError.message, gameError.code);
      return false;
    }

    return true;
  } catch (error) {
    console.log('Unexpected error deleting game:', error);
    return false;
  }
}

export async function withdrawRequest(gameId: string) {
  if (!gameId) return false;

  const user = await getCurrentUserId();

  if (!user?.id) return false;

  const { error } = await supabase
    .from('game_players')
    .delete()
    .eq('game_id', gameId)
    .eq('user_id', user.id);

  if (error) {
    console.log('Error withdrawing from game:', error.message);
    return false;
  }

  return true;
}

export function useGames() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGames must be used within a GameProvider');
  }
  return context;
}