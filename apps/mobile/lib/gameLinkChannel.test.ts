import { describe, expect, it } from 'vitest';
import { parseGameLinkChannel } from './gameLinkChannel';

describe('parseGameLinkChannel', () => {
  it('maps allowlisted channel codes', () => {
    expect(parseGameLinkChannel('r')).toEqual({ code: 'r', channel: 'reddit' });
    expect(parseGameLinkChannel('f')).toEqual({ code: 'f', channel: 'facebook' });
    expect(parseGameLinkChannel('l')).toEqual({ code: 'l', channel: 'luma' });
    expect(parseGameLinkChannel('e')).toEqual({ code: 'e', channel: 'eventbrite' });
    expect(parseGameLinkChannel('i')).toEqual({ code: 'i', channel: 'instagram' });
    expect(parseGameLinkChannel('lin')).toEqual({ code: 'lin', channel: 'linkedin' });
    expect(parseGameLinkChannel('w')).toEqual({ code: 'w', channel: 'whatsapp' });
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(parseGameLinkChannel(' R ')).toEqual({ code: 'r', channel: 'reddit' });
    expect(parseGameLinkChannel('LIN')).toEqual({ code: 'lin', channel: 'linkedin' });
  });

  it('rejects missing, empty, and unknown values', () => {
    expect(parseGameLinkChannel(null)).toBeNull();
    expect(parseGameLinkChannel(undefined)).toBeNull();
    expect(parseGameLinkChannel('')).toBeNull();
    expect(parseGameLinkChannel('""')).toBeNull();
    expect(parseGameLinkChannel('twitter')).toBeNull();
    expect(parseGameLinkChannel('reddit')).toBeNull();
    expect(parseGameLinkChannel('li')).toBeNull();
  });
});
