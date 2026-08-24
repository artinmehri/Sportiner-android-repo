import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const PUBLIC_GAME_ID = /^[0-9a-f]{32}$/;
const INTERNAL_GAME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicGameState =
  | 'available'
  | 'full'
  | 'started'
  | 'cancelled'
  | 'completed'
  | 'expired'
  | 'invalid'
  | 'not_found_or_restricted';

export type PublicGameLinkResolution =
  | {
      status: 'resolved';
      state: 'available' | 'full';
      gameId: string;
      publicId: string;
    }
  | {
      status: 'unavailable';
      state: Exclude<PublicGameState, 'available' | 'full'>;
      publicId: string | null;
    };

type ResolverPayload = {
  state?: unknown;
  id?: unknown;
  public_id?: unknown;
};

export function normalizePublicGameId(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return PUBLIC_GAME_ID.test(normalized) ? normalized : null;
}

function isPublicGameState(value: unknown): value is PublicGameState {
  return [
    'available',
    'full',
    'started',
    'cancelled',
    'completed',
    'expired',
    'invalid',
    'not_found_or_restricted',
  ].includes(String(value));
}

export function parsePublicGameResolution(
  value: unknown,
  requestedPublicId: string,
): PublicGameLinkResolution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The game resolver returned an invalid response.');
  }

  const payload = value as ResolverPayload;
  if (!isPublicGameState(payload.state)) {
    throw new Error('The game resolver returned an unknown state.');
  }

  if (payload.state === 'available' || payload.state === 'full') {
    if (
      typeof payload.id !== 'string' ||
      !INTERNAL_GAME_ID.test(payload.id) ||
      payload.public_id !== requestedPublicId
    ) {
      throw new Error('The game resolver returned an invalid game reference.');
    }

    return {
      status: 'resolved',
      state: payload.state,
      gameId: payload.id,
      publicId: requestedPublicId,
    };
  }

  return {
    status: 'unavailable',
    state: payload.state,
    publicId: requestedPublicId,
  };
}

export async function resolvePublicGameLink(
  publicIdValue: string | null | undefined,
  shareCodeValue?: string | null,
): Promise<PublicGameLinkResolution> {
  const publicId = normalizePublicGameId(publicIdValue);
  if (!publicId) {
    return { status: 'unavailable', state: 'invalid', publicId: null };
  }

  if (!isSupabaseConfigured) {
    throw new Error('Sportiner is not configured to open game links.');
  }

  const shareCode = shareCodeValue?.trim() || null;
  const { data, error } = await supabase.rpc('resolve_public_game_v1', {
    public_id: publicId,
    share_code: shareCode,
  });

  if (error) {
    throw new Error('Unable to load this game right now.');
  }

  return parsePublicGameResolution(data, publicId);
}
