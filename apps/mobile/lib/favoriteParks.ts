import { getDefaultCourts } from './courtSuggestions';

// Same names as create-game court suggestions — exact games.location_name values.
export const FAVORITE_PARK_OPTIONS = getDefaultCourts().map((court) => court.name);

export type FavoriteParkOption = (typeof FAVORITE_PARK_OPTIONS)[number];

export function isFavoriteParkOption(value: string): value is FavoriteParkOption {
  return FAVORITE_PARK_OPTIONS.includes(value);
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
