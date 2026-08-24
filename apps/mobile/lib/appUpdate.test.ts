import { describe, expect, it, vi } from 'vitest';

import { APP_STORE_URL } from '../constants/appStore';
import {
  isAppUpdateAvailable,
  isNewerVersion,
  shouldStartUpdateCheck,
} from './appUpdate';

const appStoreResponse = (version: unknown) => ({
  results: [{ trackId: 6758223656, bundleId: 'com.sportiner.app', version }],
});

const fetchResponse = (payload: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: vi.fn().mockResolvedValue(payload) });

describe('isNewerVersion', () => {
  it('compares numeric version components', () => {
    expect(isNewerVersion('1.0.2', '1.0.1')).toBe(true);
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.0.1', '1.0.1')).toBe(false);
    expect(isNewerVersion('1.0.1', '1.0.2')).toBe(false);
  });

  it('fails safely for malformed versions', () => {
    expect(isNewerVersion('latest', '1.0.1')).toBe(false);
    expect(isNewerVersion('1.0.2', '')).toBe(false);
  });
});

describe('isAppUpdateAvailable', () => {
  it('prompts only when the App Store version is newer', async () => {
    await expect(
      isAppUpdateAvailable('1.0.1', fetchResponse(appStoreResponse('1.0.2'))),
    ).resolves.toBe(true);
    await expect(
      isAppUpdateAvailable('1.0.2', fetchResponse(appStoreResponse('1.0.2'))),
    ).resolves.toBe(false);
  });

  it('fails safely when lookup fails or returns malformed data', async () => {
    const networkFailure = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(isAppUpdateAvailable('1.0.1', networkFailure)).resolves.toBe(false);
    await expect(
      isAppUpdateAvailable('1.0.1', fetchResponse(appStoreResponse('invalid'))),
    ).resolves.toBe(false);
    await expect(
      isAppUpdateAvailable('1.0.1', fetchResponse({ results: [] })),
    ).resolves.toBe(false);
  });
});

describe('shouldStartUpdateCheck', () => {
  it('checks once after iOS navigation is ready', () => {
    expect(shouldStartUpdateCheck('ios', true, false)).toBe(true);
    expect(shouldStartUpdateCheck('ios', true, true)).toBe(false);
    expect(shouldStartUpdateCheck('ios', false, false)).toBe(false);
    expect(shouldStartUpdateCheck('android', true, false)).toBe(false);
  });
});

it('uses the Sportiner App Store listing', () => {
  expect(APP_STORE_URL).toBe('https://apps.apple.com/ca/app/id6758223656');
});
