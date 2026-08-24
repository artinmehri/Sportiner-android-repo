import AsyncStorage from '@react-native-async-storage/async-storage';

export function gamesTabSeenStorageKey(userId: string): string {
  return `sportiner:games_tab_seen_at:${userId}`;
}

export async function loadGamesTabSeenAt(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(gamesTabSeenStorageKey(userId));
  } catch {
    return null;
  }
}

export async function saveGamesTabSeenAt(userId: string, iso: string): Promise<void> {
  try {
    await AsyncStorage.setItem(gamesTabSeenStorageKey(userId), iso);
  } catch {
    // Best-effort local cursor — badge still works for the current session.
  }
}

/** Count join rows that should light the Games tab badge. */
export function countUnseenHostedJoins(
  joins: Array<{ user_id: string | null; joined_at: string | null }>,
  hostUserId: string,
  seenAt: string | null,
): number {
  return joins.reduce((count, join) => {
    if (!join.user_id || !join.joined_at) return count;
    if (join.user_id === hostUserId) return count;
    if (seenAt && join.joined_at <= seenAt) return count;
    return count + 1;
  }, 0);
}
