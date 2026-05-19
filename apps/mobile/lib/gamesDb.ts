import { appendGameMeta, combineDateAndTimeToIso, type GameMeta } from '@/lib/gameMeta';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type JoinResult =
  | 'joined'
  | 'requested'
  | 'already_member'
  | 'already_requested'
  | 'full'
  | 'not_authenticated'
  | 'not_configured';

export type GameRow = {
  id: string;
  host_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  time: string | null;
  level: string | null;
  public: boolean | null;
  capacity: number | null;
  players_list: unknown;
  created_at: string;
};

export type UserRow = {
  id: string;
  name: string | null;
  profile_picture: string | null;
};

export type GameInsertPayload = {
  title: string;
  gameDescription: string;
  gameType: '1v1' | 'Group';
  skillLevel: string;
  joinSetting: '👥 Open to Anyone' | '✋ Request Approval';
  courtType: string;
  isBooked: boolean;
  isPaid: boolean;
  paymentAmount?: string;
  location: string;
  date: string;
  time: string;
  numberOfPlayers: number;
};

export type PlayerCounts = Record<string, number>;

export async function fetchAllGameRows(): Promise<GameRow[]> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as GameRow[];
}

export async function fetchGameRowsForHost(hostId: string): Promise<GameRow[]> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('host_id', hostId)
    .order('time', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as GameRow[];
}

export async function fetchUpcomingGameRowsForPlayer(userId: string): Promise<GameRow[]> {
  const now = new Date().toISOString();
  const { data: memberships, error: memberErr } = await supabase
    .from('game_players')
    .select('game_id')
    .eq('user_id', userId);

  if (memberErr) {
    throw new Error(memberErr.message);
  }

  const gameIds = [...new Set((memberships ?? []).map((m) => m.game_id as string))];
  if (gameIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .in('id', gameIds)
    .neq('host_id', userId)
    .gte('time', now)
    .order('time', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as GameRow[];
}

export async function fetchPastGamesForUser(
  userId: string
): Promise<{ hosted: GameRow[]; played: GameRow[] }> {
  const now = new Date().toISOString();

  const { data: hosted, error: hostedErr } = await supabase
    .from('games')
    .select('*')
    .eq('host_id', userId)
    .lt('time', now)
    .order('time', { ascending: false });

  if (hostedErr) {
    throw new Error(hostedErr.message);
  }

  const { data: memberships, error: memberErr } = await supabase
    .from('game_players')
    .select('game_id')
    .eq('user_id', userId);

  if (memberErr) {
    throw new Error(memberErr.message);
  }

  const memberGameIds = [...new Set((memberships ?? []).map((m) => m.game_id as string))];
  if (memberGameIds.length === 0) {
    return { hosted: (hosted ?? []) as GameRow[], played: [] };
  }

  const { data: played, error: playedErr } = await supabase
    .from('games')
    .select('*')
    .in('id', memberGameIds)
    .neq('host_id', userId)
    .lt('time', now)
    .order('time', { ascending: false });

  if (playedErr) {
    throw new Error(playedErr.message);
  }

  return {
    hosted: (hosted ?? []) as GameRow[],
    played: (played ?? []) as GameRow[],
  };
}

export async function fetchPlayerCounts(gameIds: string[]): Promise<PlayerCounts> {
  if (gameIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from('game_players')
    .select('game_id')
    .in('game_id', gameIds);

  if (error) {
    return {};
  }

  const counts: PlayerCounts = {};
  for (const row of data ?? []) {
    const gameId = row.game_id as string;
    counts[gameId] = (counts[gameId] ?? 0) + 1;
  }
  return counts;
}

export async function fetchHostProfiles(hostIds: string[]): Promise<Record<string, UserRow>> {
  if (hostIds.length === 0) {
    return {};
  }

  const { data: users } = await supabase
    .from('users')
    .select('id, name, profile_picture')
    .in('id', hostIds);

  return Object.fromEntries((users ?? []).map((p: UserRow) => [p.id, p]));
}

export async function fetchUserGameMembership(userId: string): Promise<{
  joinedGameIds: string[];
  pendingGameIds: string[];
}> {
  const [{ data: memberships }, { data: requests }] = await Promise.all([
    supabase.from('game_players').select('game_id').eq('user_id', userId),
    supabase
      .from('game_requests')
      .select('game_id')
      .eq('user_id', userId)
      .eq('status', 'pending'),
  ]);

  return {
    joinedGameIds: [...new Set((memberships ?? []).map((m) => m.game_id as string))],
    pendingGameIds: [...new Set((requests ?? []).map((r) => r.game_id as string))],
  };
}

function legacyPlayerCount(row: GameRow): number {
  const list = row.players_list;
  if (Array.isArray(list)) {
    return list.length;
  }
  if (typeof list === 'string') {
    try {
      const parsed = JSON.parse(list) as unknown;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

export function resolvePlayerCount(row: GameRow, counts: PlayerCounts): number {
  const fromJoin = counts[row.id];
  if (typeof fromJoin === 'number' && fromJoin > 0) {
    return fromJoin;
  }
  const legacy = legacyPlayerCount(row);
  return legacy > 0 ? legacy : 1;
}

export async function createGameRow(
  userId: string,
  payload: GameInsertPayload
): Promise<GameRow> {
  const meta: GameMeta = {
    gameType: payload.gameType,
    joinSetting: payload.joinSetting,
    courtType: payload.courtType as GameMeta['courtType'],
    isBooked: payload.isBooked,
    isPaid: payload.isPaid,
    paymentAmount: payload.paymentAmount,
    location: payload.location,
  };

  const fullDescription = appendGameMeta(payload.gameDescription, meta);
  const gameTime = combineDateAndTimeToIso(payload.date, payload.time);
  const isOpen = payload.joinSetting === '👥 Open to Anyone';

  const row = {
    host_id: userId,
    title: payload.title,
    description: fullDescription,
    category: `${payload.gameType} · ${payload.courtType}`,
    time: gameTime,
    level: payload.skillLevel,
    public: isOpen,
    capacity: payload.numberOfPlayers,
    players_list: [userId],
    city_id: null,
  };

  const { data: inserted, error: insErr } = await supabase
    .from('games')
    .insert(row)
    .select()
    .single();

  if (insErr) {
    throw new Error(insErr.message);
  }

  const gameId = (inserted as GameRow).id;
  const { error: playerErr } = await supabase.from('game_players').insert({
    game_id: gameId,
    user_id: userId,
    role: 'host',
  });

  if (playerErr && playerErr.code !== '23505') {
    throw new Error(playerErr.message);
  }

  return inserted as GameRow;
}

async function getGameCapacityState(gameId: string): Promise<{
  capacity: number;
  playerCount: number;
  isOpen: boolean;
  hostId: string;
} | null> {
  const { data: game, error } = await supabase
    .from('games')
    .select('id, host_id, capacity, public')
    .eq('id', gameId)
    .maybeSingle();

  if (error || !game) {
    return null;
  }

  const counts = await fetchPlayerCounts([gameId]);
  const playerCount = counts[gameId] ?? 1;

  return {
    capacity: game.capacity ?? 2,
    playerCount,
    isOpen: game.public !== false,
    hostId: game.host_id as string,
  };
}

export async function addPlayerToGame(
  gameId: string,
  userId: string,
  role: 'host' | 'member' = 'member'
): Promise<void> {
  const { error } = await supabase.from('game_players').insert({
    game_id: gameId,
    user_id: userId,
    role,
  });

  if (error && error.code !== '23505') {
    throw new Error(error.message);
  }
}

export async function joinGame(gameId: string, userId: string): Promise<JoinResult> {
  if (!isSupabaseConfigured) {
    return 'not_configured';
  }

  const { data: existingMember } = await supabase
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMember) {
    return 'already_member';
  }

  const state = await getGameCapacityState(gameId);
  if (!state) {
    throw new Error('Game not found');
  }

  if (state.playerCount >= state.capacity) {
    return 'full';
  }

  if (state.isOpen) {
    await addPlayerToGame(gameId, userId, 'member');
    return 'joined';
  }

  const { data: existingRequest } = await supabase
    .from('game_requests')
    .select('id, status')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingRequest) {
    if (existingRequest.status === 'accepted') {
      return 'already_member';
    }
    return 'already_requested';
  }

  const { error: insErr } = await supabase.from('game_requests').insert({
    game_id: gameId,
    user_id: userId,
    status: 'pending',
  });

  if (insErr) {
    if (insErr.code === '23505') {
      return 'already_requested';
    }
    throw new Error(insErr.message);
  }

  return 'requested';
}

export async function approveJoinRequest(requestId: string): Promise<void> {
  const { data: request, error: fetchErr } = await supabase
    .from('game_requests')
    .select('id, game_id, user_id, status')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchErr || !request) {
    throw new Error(fetchErr?.message ?? 'Request not found');
  }

  const state = await getGameCapacityState(request.game_id as string);
  if (!state) {
    throw new Error('Game not found');
  }

  if (state.playerCount >= state.capacity) {
    throw new Error('Game is full');
  }

  const { error: updateErr } = await supabase
    .from('game_requests')
    .update({ status: 'accepted' })
    .eq('id', requestId);

  if (updateErr) {
    throw new Error(updateErr.message);
  }

  await addPlayerToGame(request.game_id as string, request.user_id as string, 'member');
}

export async function declineJoinRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('game_requests')
    .update({ status: 'rejected' })
    .eq('id', requestId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchPendingRequestsForHost(hostId: string): Promise<
  Array<{
    id: string;
    game_id: string;
    user_id: string;
    game_title: string;
    status: string;
  }>
> {
  const { data: hosted } = await supabase.from('games').select('id').eq('host_id', hostId);
  const gameIds = (hosted ?? []).map((g: { id: string }) => g.id);
  if (gameIds.length === 0) {
    return [];
  }

  const { data: rows, error } = await supabase
    .from('game_requests')
    .select('id, game_id, user_id, status')
    .in('game_id', gameIds)
    .eq('status', 'pending');

  if (error) {
    throw new Error(error.message);
  }

  const { data: games } = await supabase.from('games').select('id, title').in('id', gameIds);
  const gameMap = Object.fromEntries(
    (games ?? []).map((g: { id: string; title: string | null }) => [g.id, g.title || 'Game'])
  );

  return (rows ?? []).map((r) => ({
    id: r.id as string,
    game_id: r.game_id as string,
    user_id: r.user_id as string,
    game_title: gameMap[r.game_id as string] || 'Game',
    status: r.status as string,
  }));
}

export function isWithinDateFilter(
  timeIso: string | null | undefined,
  filter: 'Today' | 'Tomorrow' | 'This Weekend'
): boolean {
  if (!timeIso) {
    return true;
  }

  const gameDate = new Date(timeIso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  if (filter === 'Today') {
    return gameDate.toDateString() === today.toDateString();
  }

  if (filter === 'Tomorrow') {
    return gameDate.toDateString() === tomorrow.toDateString();
  }

  const startOfWeek = new Date(today);
  const daysUntilSaturday = (6 - startOfWeek.getDay() + 7) % 7;
  const saturday = new Date(today);
  saturday.setDate(saturday.getDate() + daysUntilSaturday);
  saturday.setHours(0, 0, 0, 0);

  const sunday = new Date(saturday);
  sunday.setDate(sunday.getDate() + 1);

  return (
    gameDate >= saturday &&
    gameDate <= new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59)
  );
}
