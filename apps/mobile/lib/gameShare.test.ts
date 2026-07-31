import { describe, expect, it } from 'vitest';
import { gameShareUrl } from './gameShareUrl';

describe('gameShareUrl', () => {
  it('builds a canonical link from a public game ID', () => {
    expect(gameShareUrl('ABCDEF0123456789ABCDEF0123456789')).toBe(
      'https://sportiner.com/g/abcdef0123456789abcdef0123456789',
    );
  });

  it('never replaces an invalid game ID with the generic app URL', () => {
    expect(gameShareUrl('3d6c0b4e-09fa-4ba4-a384-5fb9e9a11565')).toBeNull();
    expect(gameShareUrl(null)).toBeNull();
  });
});
