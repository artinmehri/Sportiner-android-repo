const SPORTINER_ORIGIN = 'https://sportiner.com';
const PUBLIC_GAME_ID = /^[0-9a-f]{32}$/i;

export function gameShareUrl(publicId: string | null | undefined): string | null {
  const normalized = publicId?.trim().toLowerCase() ?? '';
  return PUBLIC_GAME_ID.test(normalized) ? `${SPORTINER_ORIGIN}/g/${normalized}` : null;
}
