import { describe, expect, it } from 'vitest';
import {
  gameDeepLinkPath,
  inboundDeepLinkPath,
  isGameDeepLinkUrl,
  messageDeepLinkPath,
  resolveStartupRoute,
} from './startupDeepLink';

const publicId = '4a18af4b9c6cb2fbe9464ae11bb11937';

describe('isGameDeepLinkUrl', () => {
  it('accepts Sportiner custom-scheme game links', () => {
    expect(isGameDeepLinkUrl(`sportiner://g/${publicId}`)).toBe(true);
    expect(isGameDeepLinkUrl(`sportiner:///g/${publicId}`)).toBe(true);
  });

  it('accepts Sportiner HTTPS game links with an optional query', () => {
    expect(isGameDeepLinkUrl(`https://sportiner.com/g/${publicId}`)).toBe(true);
    expect(isGameDeepLinkUrl(`https://www.sportiner.com/g/${publicId}?s=share-code`)).toBe(true);
  });

  it('preserves a malformed game route so the link screen can explain the error', () => {
    expect(isGameDeepLinkUrl('sportiner://g/not-a-public-id')).toBe(true);
  });

  it('rejects unrelated and untrusted links', () => {
    expect(isGameDeepLinkUrl(`https://example.com/g/${publicId}`)).toBe(false);
    expect(isGameDeepLinkUrl(`https://sportiner.com/about/${publicId}`)).toBe(false);
    expect(isGameDeepLinkUrl(null)).toBe(false);
  });
});

describe('gameDeepLinkPath', () => {
  it('normalizes HTTPS and custom-scheme game URLs into router paths', () => {
    expect(gameDeepLinkPath(`https://sportiner.com/g/${publicId}`)).toBe(`/g/${publicId}`);
    expect(gameDeepLinkPath(`https://www.sportiner.com/g/${publicId}?s=abc`)).toBe(
      `/g/${publicId}?s=abc`,
    );
    expect(gameDeepLinkPath(`sportiner://g/${publicId}`)).toBe(`/g/${publicId}`);
    expect(gameDeepLinkPath(`sportiner:///g/${publicId}?s=abc`)).toBe(`/g/${publicId}?s=abc`);
  });

  it('preserves a manually tagged ch channel query through path normalization', () => {
    expect(gameDeepLinkPath(`https://sportiner.com/g/${publicId}?ch=r`)).toBe(
      `/g/${publicId}?ch=r`,
    );
    expect(gameDeepLinkPath(`https://sportiner.com/g/${publicId}?s=abc&ch=f`)).toBe(
      `/g/${publicId}?s=abc&ch=f`,
    );
    expect(gameDeepLinkPath(`sportiner://g/${publicId}?ch=lin`)).toBe(
      `/g/${publicId}?ch=lin`,
    );
  });

  it('keeps malformed public ids so /g/[id] can show invalid-link UI', () => {
    expect(gameDeepLinkPath('https://sportiner.com/g/not-a-public-id')).toBe(
      '/g/not-a-public-id',
    );
  });

  it('returns null for non-game URLs', () => {
    expect(gameDeepLinkPath(`https://sportiner.com/about/${publicId}`)).toBeNull();
    expect(gameDeepLinkPath(null)).toBeNull();
  });
});

describe('messageDeepLinkPath', () => {
  const messageUrl =
    'https://sportiner.com/open/message?chatId=abc&messageId=xyz';

  it('normalizes HTTPS and custom-scheme message URLs into router paths', () => {
    expect(messageDeepLinkPath(messageUrl)).toBe(
      '/open/message?chatId=abc&messageId=xyz',
    );
    expect(
      messageDeepLinkPath(
        'https://www.sportiner.com/open/message?chatId=abc&messageId=xyz',
      ),
    ).toBe('/open/message?chatId=abc&messageId=xyz');
    expect(
      messageDeepLinkPath('sportiner://open/message?chatId=abc&messageId=xyz'),
    ).toBe('/open/message?chatId=abc&messageId=xyz');
    expect(
      messageDeepLinkPath('sportiner:///open/message?chatId=abc&messageId=xyz'),
    ).toBe('/open/message?chatId=abc&messageId=xyz');
  });

  it('rejects unrelated and untrusted links', () => {
    expect(
      messageDeepLinkPath(
        'https://example.com/open/message?chatId=abc&messageId=xyz',
      ),
    ).toBeNull();
    expect(messageDeepLinkPath(`https://sportiner.com/g/${publicId}`)).toBeNull();
    expect(messageDeepLinkPath('https://sportiner.com/open/inbox')).toBeNull();
    expect(messageDeepLinkPath(null)).toBeNull();
  });
});

describe('inboundDeepLinkPath', () => {
  it('accepts both shared-game and exact-message URLs', () => {
    expect(inboundDeepLinkPath(`https://sportiner.com/g/${publicId}`)).toBe(
      `/g/${publicId}`,
    );
    expect(
      inboundDeepLinkPath(
        'https://sportiner.com/open/message?chatId=abc&messageId=xyz',
      ),
    ).toBe('/open/message?chatId=abc&messageId=xyz');
  });
});

describe('resolveStartupRoute', () => {
  it('upgrades tabs to game-link when a shared game URL is pending', () => {
    expect(resolveStartupRoute('tabs', null, true)).toBe('game-link');
    expect(resolveStartupRoute('tabs', 'tabs', true)).toBe('game-link');
    expect(resolveStartupRoute('game-link', 'tabs', true)).toBe('game-link');
  });

  it('does not let tabs overwrite an already selected game-link route', () => {
    expect(resolveStartupRoute('tabs', 'game-link', true)).toBe('game-link');
    expect(resolveStartupRoute('tabs', 'game-link', false)).toBe('game-link');
  });

  it('never skips terms or auth gates for a pending game link', () => {
    expect(resolveStartupRoute('agreement-tabs', 'tabs', true)).toBe('agreement-tabs');
    expect(resolveStartupRoute('agreement-signup', null, true)).toBe('agreement-signup');
    expect(resolveStartupRoute('signup', null, true)).toBe('signup');
  });
});
