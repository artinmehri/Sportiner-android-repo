import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizePublicGameId,
  parsePublicGameResolution,
  resolvePublicGameLink,
} from './gameResolver';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc },
}));

const publicId = '4a18af4b9c6cb2fbe9464ae11bb11937';
const gameId = 'e2400faa-1e08-44a8-b763-af0ad761c3c4';

describe('gameResolver', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('normalizes a valid public game ID', () => {
    expect(normalizePublicGameId(`  ${publicId.toUpperCase()}  `)).toBe(publicId);
    expect(normalizePublicGameId(gameId)).toBeNull();
  });

  it('resolves a public ID to the internal game ID', async () => {
    rpc.mockResolvedValue({
      data: {
        state: 'available',
        id: gameId,
        public_id: publicId,
      },
      error: null,
    });

    await expect(resolvePublicGameLink(publicId)).resolves.toEqual({
      status: 'resolved',
      state: 'available',
      gameId,
      publicId,
    });
    expect(rpc).toHaveBeenCalledWith('resolve_public_game_v1', {
      public_id: publicId,
      share_code: null,
    });
  });

  it('returns one neutral unavailable result for a restricted game', () => {
    expect(
      parsePublicGameResolution(
        {
          state: 'not_found_or_restricted',
          id: null,
          public_id: publicId,
        },
        publicId,
      ),
    ).toEqual({
      status: 'unavailable',
      state: 'not_found_or_restricted',
      publicId,
    });
  });

  it('recognizes an expired game as unavailable', () => {
    expect(
      parsePublicGameResolution(
        {
          state: 'expired',
          id: null,
          public_id: publicId,
        },
        publicId,
      ),
    ).toEqual({
      status: 'unavailable',
      state: 'expired',
      publicId,
    });
  });

  it('rejects a resolver response for a different public game', () => {
    expect(() =>
      parsePublicGameResolution(
        {
          state: 'available',
          id: gameId,
          public_id: 'abcdef0123456789abcdef0123456789',
        },
        publicId,
      ),
    ).toThrow('invalid game reference');
  });
});
