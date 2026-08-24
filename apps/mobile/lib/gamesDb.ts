import { parseGameMeta } from '@/lib/gameMeta';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { findCourtByName, type GeoCoords } from '@/lib/courtSuggestions';
import { isUpcomingGameTime } from '@/lib/gameTime';

export type JoinResult =
  | 'joined'
  | 'requested'
  | 'already_member'
  | 'already_requested'
  | 'full'
  | 'not_found'
  | 'not_authenticated'
  | 'not_configured';

export type GeographyPoint =
  | {
      type: 'Point';
      coordinates: [number, number];
    }
  | string;

export type GameRow = {
  id: string;
  public_id: string | null;
  created_at: string;
  host_id: string | null;
  status?: 'scheduled' | 'cancelled' | 'completed' | 'expired' | null;
  duration_minutes?: number | null;
  title: string | null;
  description: string | null;
  type: string | null;
  location_cords: GeographyPoint | null;
  time: string | null;
  location_name: string | null;
  chat_id: string;
  level: string | null;
  is_public: boolean | null;
  game_capacity: number | null;
  is_booked: boolean | null;
  payment_amount: number | null;
  image: string | null;
  court_type: string | null;
  is_paid: boolean | null;
  players_enrolled: number | null;
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
  payment_amount?: string | number | null;
  location_name: string;
  locationCoords?: GeoCoords | null;
  date: string;
  time: string;
  numberOfPlayers: number;
};

export type UserRow = {
  id: string;
  name: string | null;
  profile_picture: string | null;
};

export type PlayerCounts = Record<string, number>;

function parseCategoryParts(category: string | null | undefined): {
  gameType?: '1v1' | 'Group';
  courtType?: string;
} {
  if (!category?.trim()) {
    return {};
  }

  const parts = category
    .split(/[|•·,-]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const normalized = category.toLowerCase();
  const gameType = normalized.includes('1v1') || normalized.includes('1 vs 1')
    ? '1v1'
    : normalized.includes('group')
      ? 'Group'
      : undefined;

  const courtType = parts.find((part) => {
    const value = part.toLowerCase();
    return value === 'public' || value === 'club' || value === 'condo';
  });

  return { gameType, courtType };
}

function combineDateAndTimeToIso(dateValue: string, timeValue: string): string {
  const safeDate = dateValue?.trim();
  const safeTime = timeValue?.trim();

  if (!safeDate || !safeTime) {
    return new Date().toISOString();
  }

  const datePart = safeDate.includes('T') ? safeDate.split('T')[0] : safeDate;
  const normalizedTime = /^\d{2}:\d{2}$/.test(safeTime) ? `${safeTime}:00` : safeTime;
  const combined = new Date(`${datePart}T${normalizedTime}`);

  if (Number.isNaN(combined.getTime())) {
    return new Date().toISOString();
  }

  return combined.toISOString();
}

export function resolveLocationName(row: GameRow): string {
  if (row.location_name?.trim()) {
    return row.location_name.trim();
  }
  const { meta } = parseGameMeta(row.description);
  return meta?.location?.trim() ?? '';
}

export function resolveGameType(row: GameRow): '1v1' | 'Group' {
  const raw = row.type?.trim();
  if (raw === '1v1' || raw === 'Group') {
    return raw;
  }
  const fromCategory = parseCategoryParts(row.type).gameType;
  if (fromCategory === '1v1' || fromCategory === 'Group') {
    return fromCategory;
  }
  const { meta } = parseGameMeta(row.description);
  if (meta?.gameType) {
    return meta.gameType;
  }
  return raw?.startsWith('1v1') ? '1v1' : 'Group';
}


export function resolveCourtType(row: GameRow): string {
  if (row.court_type?.trim()) {
    return row.court_type.trim();
  }
  const fromCategory = parseCategoryParts(row.type).courtType;
  if (fromCategory) {
    return fromCategory;
  }
  const { meta } = parseGameMeta(row.description);
  if (meta?.courtType) return meta.courtType;
  return 'Public';
}

export function resolveGameCapacity(row: GameRow): number {
  const gameType = resolveGameType(row);

  if (gameType === '1v1') {
    return 2;
  }

  return row.game_capacity ?? 2;
}

function resolveGameIsOpen(row: GameRow): boolean {
  return row.is_public !== false;
}

export function resolveJoinSetting(row: GameRow): '👥 Open to Anyone' | '✋ Request Approval' {
  if (typeof row.is_public === 'boolean') {
    return row.is_public !== false ? '👥 Open to Anyone' : '✋ Request Approval';
  }
  return resolveGameIsOpen(row) ? '👥 Open to Anyone' : '✋ Request Approval';
}

export function resolveIsBooked(row: GameRow): boolean {
  if (typeof row.is_booked === 'boolean') {
    return row.is_booked;
  }
  const { meta } = parseGameMeta(row.description);
  return meta?.isBooked ?? false;
}

export function resolveIsPaid(row: GameRow): boolean {
  if (row.is_paid === true) {
    return true;
  }
  if (typeof row.payment_amount === 'number' && row.payment_amount > 0) {
    return true;
  }
  const { meta } = parseGameMeta(row.description);
  return meta?.isPaid ?? false;
}

export function resolvePayment_amount(row: GameRow): number | null {
  if (typeof row.payment_amount === 'number') {
    return row.payment_amount > 0 ? row.payment_amount : null;
  }
  const { meta } = parseGameMeta(row.description);
  if (typeof meta?.paymentAmount === 'number' && meta.paymentAmount > 0) {
    return meta.paymentAmount;
  }
  return null;
}

export function formatCourtShare(
  isPaid: boolean,
  amount: number | null | undefined,
  variant: 'full' | 'compact' = 'full'
): string {
  if (!isPaid || !amount || amount <= 0) {
    return 'Free';
  }

  return variant === 'compact'
    ? `$${amount} court share`
    : `Court share: $${amount} offline`;
}

export async function fetchAllGameRows(): Promise<GameRow[]> {
  const now = new Date();
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .gte('time', now.toISOString())
    .order('time', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as GameRow[]).filter((row) =>
    isUpcomingGameTime(row.time, now)
  );
}

export async function fetchGameRowById(gameId: string): Promise<GameRow | null> {
  const normalizedId = gameId.trim();
  if (!normalizedId) {
    return null;
  }

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', normalizedId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as GameRow | null) ?? null;
}

export async function fetchGameRowsForHost(hostId: string): Promise<GameRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('host_id', hostId)
    .gte('time', now)
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

export async function fetchPendingRequestedGameRowsForPlayer(userId: string): Promise<GameRow[]> {
  const now = new Date().toISOString();
  const { data: requests, error: requestErr } = await supabase
    .from('game_requests')
    .select('game_id')
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (requestErr) {
    throw new Error(requestErr.message);
  }

  const gameIds = [...new Set((requests ?? []).map((r) => r.game_id as string))];
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
  if (typeof row.players_enrolled === 'number' && row.players_enrolled > 0) {
    return row.players_enrolled;
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
  const gameTime = combineDateAndTimeToIso(payload.date, payload.time);
  const isOpen = payload.joinSetting === '👥 Open to Anyone';
  const coords =
    payload.locationCoords ??
    (() => {
      const court = findCourtByName(payload.location_name);
      return court ? { lat: court.lat, lng: court.lng } : null;
    })();

  const row = {
    host_id: userId,
    title: payload.title,
    description: payload.gameDescription.trim(),
    type: payload.gameType,
    location_cords: coords
      ? `POINT(${coords.lng} ${coords.lat})`
      : null,
    time: gameTime,
    level: payload.skillLevel,
    is_public: isOpen,
    game_capacity: payload.gameType === '1v1' ? 2 : payload.numberOfPlayers,
    is_booked: payload.isBooked,
    is_paid: payload.isPaid,
    payment_amount:
      payload.isPaid && payload.payment_amount != null && String(payload.payment_amount).trim()
        ? (() => {
            const amount = Math.round(parseFloat(String(payload.payment_amount)));
            return Number.isFinite(amount) && amount > 0 ? amount : null;
          })()
        : null,
    court_type: payload.courtType,
    location_name: payload.location_name,
    players_enrolled: 1,
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
    .select('*')
    .eq('id', gameId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!game) {
    return null;
  }

  const row = game as GameRow;
  const counts = await fetchPlayerCounts([gameId]);
  const playerCount = counts[gameId] ?? 1;

  return {
    capacity: resolveGameCapacity(row),
    playerCount,
    isOpen: resolveGameIsOpen(row),
    hostId: row.host_id ?? '',
  };
}

export async function addPlayerToGame(
  gameId: string,
  userId: string,
  role: 'host' | 'member' = 'member'
): Promise<'added' | 'already_member'> {
  const { error } = await supabase.from('game_players').insert({
    game_id: gameId,
    user_id: userId,
    role,
    joined_at: new Date().toISOString(),
  });

  if (error?.code === '23505') {
    return 'already_member';
  }

  if (error) {
    throw error;
  }

  return 'added';
}

export async function joinGame(gameId: string, userId: string): Promise<JoinResult> {
  if (!isSupabaseConfigured) {
    return 'not_configured';
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== userId) {
    return 'not_authenticated';
  }

  const { data, error } = await supabase.rpc('join_public_game', {
    p_game_id: gameId,
  });

  if (error) {
    throw error;
  }

  const result = data as JoinResult;
  if (
    result === 'joined' ||
    result === 'requested' ||
    result === 'already_member' ||
    result === 'already_requested' ||
    result === 'full' ||
    result === 'not_found' ||
    result === 'not_authenticated'
  ) {
    return result;
  }

  throw new Error(`Unexpected join result: ${String(data)}`);
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
  // Increment players_enrolled in games table
  await supabase
    .from('games')
    .update({ players_enrolled: state.playerCount + 1 })
    .eq('id', request.game_id as string);
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
