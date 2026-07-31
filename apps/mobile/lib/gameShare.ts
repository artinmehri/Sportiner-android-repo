import { Share } from 'react-native';
import { gameShareUrl } from '@/lib/gameShareUrl';
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
  time?: string | null;
  location?: string | null;
  address?: string | null;
  level?: string | null;
  cost?: string | null;
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
  const url = await resolveGameShareUrl(game.publicId, surface);
  if (!url) return false;

  const place = game.location?.trim() || game.address?.trim() || null;
  const detailLines = [
    game.time?.trim() ? `📅 ${game.time.trim()}` : null,
    place ? `📍 ${place}` : null,
    game.level?.trim() ? `⚡ ${game.level.trim()}` : null,
    game.cost?.trim() ? `💰 ${game.cost.trim()}` : null,
  ].filter((value): value is string => Boolean(value));

  // Put the URL in the message body so Android (which often ignores `url`) still
  // shares a real game link, not a generic app marketing URL.
  const message = [
    `Come play tennis with me 🎾`,
    game.title.trim() || null,
    detailLines.length ? detailLines.join('\n') : null,
    `Open the game on Sportiner:\n${url}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  await Share.share({
    title: `${game.title.trim() || 'Tennis game'} · Sportiner`,
    message,
    url,
  });
  return true;
}
