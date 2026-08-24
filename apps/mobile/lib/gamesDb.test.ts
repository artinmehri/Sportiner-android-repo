import { describe, expect, it } from 'vitest';

import { combineLocalDateAndTime, isUpcomingGameTime } from './gameTime';

describe('isUpcomingGameTime', () => {
  const now = new Date('2026-08-09T04:49:18.000Z');

  it('accepts games starting now or later', () => {
    expect(isUpcomingGameTime('2026-08-09T04:49:18.000Z', now)).toBe(true);
    expect(isUpcomingGameTime('2026-08-25T17:00:00.000Z', now)).toBe(true);
  });

  it('rejects past or invalid game times', () => {
    expect(isUpcomingGameTime('2026-07-31T18:00:00.000Z', now)).toBe(false);
    expect(isUpcomingGameTime(null, now)).toBe(false);
    expect(isUpcomingGameTime('not-a-date', now)).toBe(false);
  });
});

describe('combineLocalDateAndTime', () => {
  it('preserves the selected local calendar date and clock time', () => {
    const result = combineLocalDateAndTime('2026-07-17T04:00:00.000Z', '18:30');
    const parsed = new Date(result!);

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(6);
    expect(parsed.getDate()).toBe(17);
    expect(parsed.getHours()).toBe(18);
    expect(parsed.getMinutes()).toBe(30);
  });

  it('rejects invalid dates and clock times', () => {
    expect(combineLocalDateAndTime('not-a-date', '18:30')).toBeNull();
    expect(combineLocalDateAndTime('2026-07-17', '25:00')).toBeNull();
    expect(combineLocalDateAndTime('2026-07-17', '6:30')).toBeNull();
  });
});
