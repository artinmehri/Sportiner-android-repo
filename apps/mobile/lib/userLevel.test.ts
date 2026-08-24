import { describe, expect, it } from 'vitest';

import { eloForUserLevel, parseUserLevel, userLevelLabel } from './userLevel';

describe('eloForUserLevel', () => {
  it('matches the starting ratings onboarding writes', () => {
    expect(eloForUserLevel('beginner')).toBe(400);
    expect(eloForUserLevel('intermediate')).toBe(800);
    expect(eloForUserLevel('advanced')).toBe(1200);
    expect(eloForUserLevel('pro')).toBe(1600);
  });

  it('reads levels stored with legacy casing', () => {
    expect(eloForUserLevel('Intermediate')).toBe(800);
    expect(eloForUserLevel(' PRO ')).toBe(1600);
  });

  it('returns null for a level we do not score, so saving leaves elo untouched', () => {
    expect(eloForUserLevel(null)).toBeNull();
    expect(eloForUserLevel('')).toBeNull();
    expect(eloForUserLevel('semi-pro')).toBeNull();
  });
});

describe('parseUserLevel', () => {
  it('normalizes known levels and preserves unknown ones', () => {
    expect(parseUserLevel('Advanced')).toBe('advanced');
    expect(parseUserLevel('semi-pro')).toBe('semi-pro');
    expect(parseUserLevel('   ')).toBeNull();
  });
});

describe('userLevelLabel', () => {
  it('labels known levels and falls back to the stored text', () => {
    expect(userLevelLabel('pro')).toBe('Pro');
    expect(userLevelLabel('semi-pro')).toBe('semi-pro');
    expect(userLevelLabel(null)).toBeNull();
  });
});
