import { describe, expect, it } from 'vitest';

import { buildSingleLinkShareContent } from './nativeShareContent';

const url = 'https://sportiner.com/g/abcdef0123456789abcdef0123456789';

describe('buildSingleLinkShareContent', () => {
  it('places one URL on its own line in the iOS message', () => {
    const content = buildSingleLinkShareContent({
      title: 'Tennis game · Sportiner',
      message: 'Come play tennis with me 🎾',
      url,
      platform: 'ios',
      androidLinkText: `Open the game on Sportiner:\n${url}`,
    });

    expect(content.url).toBeUndefined();
    expect(content.message).toBe(`Come play tennis with me 🎾\n${url}`);
    expect(content.message.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
  });

  it('includes the URL exactly once in the Android message', () => {
    const content = buildSingleLinkShareContent({
      title: 'Tennis game · Sportiner',
      message: 'Come play tennis with me 🎾',
      url,
      platform: 'android',
      androidLinkText: `Open the game on Sportiner:\n${url}`,
    });

    expect(content.url).toBeUndefined();
    expect(content.message.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
  });
});
