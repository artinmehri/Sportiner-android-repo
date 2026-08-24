import { describe, expect, it } from 'vitest';

import { buildGameShareMessage, getGameShareSpotsLeft } from './gameShareMessage';

const startsAt = new Date(2026, 7, 28, 18, 30).toISOString();
const pick = (gameType: '1v1' | 'Group', index: number, spotsLeft = 3) =>
  buildGameShareMessage(
    {
      gameType,
      startsAt,
      location: 'Cedarvale Park',
      level: 'Intermediate',
      spotsLeft,
    },
    () => (index + 0.1) / 5,
  );

describe('buildGameShareMessage', () => {
  it('provides five distinct 1-on-1 messages with the correct metadata', () => {
    const messages = Array.from({ length: 5 }, (_, index) => pick('1v1', index, 1));

    expect(messages).toEqual([
      `Hey! I'm looking for someone to play tennis. Wanna join me? 🎾\nCedarvale Park\nFriday, August 28 at 6:30 PM`,
      `Anyone down for tennis? I need one more player 🎾\nCedarvale Park\nFriday, August 28 at 6:30 PM`,
      `I've got a tennis game planned and I'm looking for someone to hit with. Interested?\nCedarvale Park\nFriday, August 28 at 6:30 PM`,
      `Intermediate tennis. Looking for one person to play, you in? 🎾\nCedarvale Park\nFriday, August 28 at 6:30 PM`,
      `Want to play tennis? I'm setting up a 1-on-1 and thought you might be up for it 🎾\nCedarvale Park\nFriday, August 28 at 6:30 PM`,
    ]);
    expect(new Set(messages)).toHaveLength(5);
    expect(messages.join(' ')).not.toMatch(/group game|group tennis/);
  });

  it('provides five distinct group messages with the correct metadata', () => {
    const messages = Array.from({ length: 5 }, (_, index) => pick('Group', index));

    expect(messages).toEqual([
      `We're getting a group together for intermediate tennis 🎾 Come join us if you're down!\n\nCedarvale Park\n\nFriday, August 28 at 6:30 PM`,
      `Tennis 👀 We've got a group game going and there are 3 spots open if you want to play.\n\nCedarvale Park\n\nFriday, August 28 at 6:30 PM`,
      `We've got a tennis group playing. Want in? 🎾\n\nCedarvale Park\n\nFriday, August 28 at 6:30 PM`,
      `Intermediate tennis. We're filling the remaining spots. Come play if you're free!\n\nCedarvale Park\n\nFriday, August 28 at 6:30 PM`,
      `There's a group tennis game happening. If that sounds fun, grab a spot 🎾\n\nCedarvale Park\n\nFriday, August 28 at 6:30 PM`,
    ]);
    expect(new Set(messages)).toHaveLength(5);
    expect(messages.join(' ')).not.toMatch(/one more player|1-on-1/);
  });

  it('handles missing optional metadata without leaking nullish values', () => {
    const messages = [
      buildGameShareMessage(
        { gameType: '1v1', spotsLeft: 1, startsAt: null, location: null, level: null },
        () => 0,
      ),
      buildGameShareMessage(
        { gameType: 'Group', spotsLeft: 1, startsAt: 'invalid', location: undefined, level: undefined },
        () => 0.4,
      ),
    ];

    expect(messages).toEqual([
      `Hey! I'm looking for someone to play tennis. Wanna join me? 🎾`,
      `We've got a tennis group playing. Want in? 🎾`,
    ]);
    expect(messages.join(' ')).not.toMatch(/undefined|null|invalid/);
  });

  it('uses exact singular spot copy', () => {
    expect(pick('Group', 1, 1)).toContain(`there's 1 spot open if you want to play`);
  });

  it('blocks invite copy when a game has no open spots', () => {
    expect(getGameShareSpotsLeft(4, 3)).toBe(1);
    expect(getGameShareSpotsLeft(4, 4)).toBe(0);
    expect(getGameShareSpotsLeft(4, 5)).toBe(0);
  });
});
