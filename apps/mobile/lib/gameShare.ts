import { Share } from 'react-native';
import { gameShareUrl } from '@/lib/gameShareUrl';

type ShareableGame = {
  publicId?: string | null;
  title: string;
  time?: string | null;
  location?: string | null;
  level?: string | null;
  cost?: string | null;
};

export async function shareGame(game: ShareableGame): Promise<boolean> {
  const url = gameShareUrl(game.publicId);
  if (!url) return false;

  const details = [game.time, game.location, game.level, game.cost]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n');
  const message = [`Join ${game.title} on Sportiner 🎾`, details, url]
    .filter(Boolean)
    .join('\n\n');

  await Share.share({ title: `${game.title} · Sportiner`, message, url });
  return true;
}
