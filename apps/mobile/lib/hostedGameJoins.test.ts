import { describe, expect, it } from 'vitest';
import { countUnseenHostedJoins, gamesTabSeenStorageKey } from './hostedGameJoins';

describe('countUnseenHostedJoins', () => {
  it('ignores the host and joins at or before the seen cursor', () => {
    expect(
      countUnseenHostedJoins(
        [
          { user_id: 'host', joined_at: '2026-08-10T12:01:00.000Z' },
          { user_id: 'player-a', joined_at: '2026-08-10T11:00:00.000Z' },
          { user_id: 'player-b', joined_at: '2026-08-10T12:00:00.000Z' },
          { user_id: 'player-c', joined_at: '2026-08-10T12:05:00.000Z' },
        ],
        'host',
        '2026-08-10T12:00:00.000Z',
      ),
    ).toBe(1);
  });

  it('counts every non-host join when there is no seen cursor', () => {
    expect(
      countUnseenHostedJoins(
        [
          { user_id: 'host', joined_at: '2026-08-10T10:00:00.000Z' },
          { user_id: 'player-a', joined_at: '2026-08-10T11:00:00.000Z' },
          { user_id: 'player-b', joined_at: '2026-08-10T12:00:00.000Z' },
        ],
        'host',
        null,
      ),
    ).toBe(2);
  });
});

describe('gamesTabSeenStorageKey', () => {
  it('scopes the cursor to the signed-in user', () => {
    expect(gamesTabSeenStorageKey('user-1')).toBe('sportiner:games_tab_seen_at:user-1');
  });
});
