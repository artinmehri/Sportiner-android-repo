// Exact games.location_name values used by favorite-park matching.
export const FAVORITE_PARK_OPTIONS = [
  'Sir Winston Churchill Park Tennis Club',
  'Cedarvale Park',
  'Oriole Park',
  'Hillcrest Park',
] as const;

export type FavoriteParkOption = (typeof FAVORITE_PARK_OPTIONS)[number];

export function isFavoriteParkOption(value: string): value is FavoriteParkOption {
  return (FAVORITE_PARK_OPTIONS as readonly string[]).includes(value);
}

/** Short label for UI copy, e.g. "Cedarvale Park" → "Cedarvale". */
export function favoriteParkShortName(park: string | null | undefined): string | null {
  if (!park?.trim()) {
    return null;
  }

  return park
    .trim()
    .replace(/\s+Tennis Club$/i, '')
    .replace(/\s+Park$/i, '')
    .trim();
}
