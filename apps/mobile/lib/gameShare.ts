import { Platform, Share } from 'react-native';
import { buildGameShareMessage, getGameShareSpotsLeft } from '@/lib/gameShareMessage';
import { gameShareUrl } from '@/lib/gameShareUrl';
import { buildSingleLinkShareContent } from '@/lib/nativeShareContent';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type GameShareSurface =
  | 'game_detail'
  | 'creation_success'
  | 'native_sheet'
  | 'copy'
  | 'profile'
  | 'suggestion'
  | 'push';

type ShareableGame = {
  publicId?: string | null;
  title: string;
  gameType: '1v1' | 'Group';
  startsAt?: string | null;
  location?: string | null;
  address?: string | null;
  level?: string | null;
  capacity: number;
  playersEnrolled: number;
};

async function resolveGameShareUrl(
  publicId: string | null | undefined,
  surface: GameShareSurface,
): Promise<string | null> {
  const fallback = gameShareUrl(publicId);
  if (!fallback || !isSupabaseConfigured || !publicId) {
    return fallback;
  }

  try {
    const { data, error } = await supabase.rpc('create_or_get_game_share_link_v1', {
      p_game_public_id: publicId.trim().toLowerCase(),
      p_surface: surface,
    });

    if (error || !data || typeof data !== 'object') {
      return fallback;
    }

    const payload = data as { ok?: boolean; url?: string };
    if (payload.ok && typeof payload.url === 'string' && payload.url.startsWith('https://sportiner.com/g/')) {
      return payload.url;
    }
  } catch (error) {
    console.warn('[gameShare] Falling back to canonical public game URL', error);
  }

  return fallback;
}

export async function shareGame(
  game: ShareableGame,
  surface: GameShareSurface = 'native_sheet',
): Promise<boolean> {
  const spotsLeft = getGameShareSpotsLeft(game.capacity, game.playersEnrolled);
  if (!spotsLeft) return false;

  const url = await resolveGameShareUrl(game.publicId, surface);
  if (!url) return false;

  const place = game.location?.trim() || game.address?.trim() || null;
  const message = buildGameShareMessage({
    gameType: game.gameType,
    startsAt: game.startsAt,
    location: place,
    level: game.level,
    spotsLeft,
  });

  await Share.share(buildSingleLinkShareContent({
    title: `${game.title.trim() || 'Tennis game'} · Sportiner`,
    message,
    url,
    platform: Platform.OS,
    androidLinkText: `Open the game on Sportiner:\n${url}`,
  }));
  return true;
}
