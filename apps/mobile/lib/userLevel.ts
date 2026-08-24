// Self-declared tennis level and the starting ELO it maps to.
// Shared by onboarding and profile settings so the two can't drift apart.
export const USER_LEVEL_OPTIONS = [
  { id: 'beginner', label: 'Beginner', elo: 400 },
  { id: 'intermediate', label: 'Intermediate', elo: 800 },
  { id: 'advanced', label: 'Advanced', elo: 1200 },
  { id: 'pro', label: 'Pro', elo: 1600 },
] as const;

export type UserLevel = (typeof USER_LEVEL_OPTIONS)[number]['id'];

function findLevelOption(value: unknown) {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase();
  return USER_LEVEL_OPTIONS.find((option) => option.id === id) ?? null;
}

/** Normalizes a stored level ("Beginner", "PRO") to its option id, keeping unknown values as typed. */
export function parseUserLevel(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return findLevelOption(value)?.id ?? value.trim();
}

export function userLevelLabel(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return findLevelOption(value)?.label ?? value.trim();
}

/** Starting ELO for a level, or null for a level we don't score. */
export function eloForUserLevel(value: unknown): number | null {
  return findLevelOption(value)?.elo ?? null;
}
