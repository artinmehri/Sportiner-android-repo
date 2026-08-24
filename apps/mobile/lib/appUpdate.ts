import { APP_STORE_ID } from '../constants/appStore';

const APP_BUNDLE_ID = 'com.sportiner.app';
const LOOKUP_URL = `https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=ca`;
const VERSION_PATTERN = /^\d+(?:\.\d+){0,2}$/;

type Fetcher = (url: string) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

function versionParts(version: string): number[] | null {
  if (!VERSION_PATTERN.test(version)) return null;

  const parts = version.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function isNewerVersion(latest: string, installed: string): boolean {
  const latestParts = versionParts(latest);
  const installedParts = versionParts(installed);
  if (!latestParts || !installedParts) return false;

  const length = Math.max(latestParts.length, installedParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (latestParts[index] ?? 0) - (installedParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }

  return false;
}

export function shouldStartUpdateCheck(
  platform: string,
  navigationReady: boolean,
  alreadyChecked: boolean,
): boolean {
  return platform === 'ios' && navigationReady && !alreadyChecked;
}

async function latestAppStoreVersion(fetcher: Fetcher): Promise<string | null> {
  try {
    const response = await fetcher(LOOKUP_URL);
    if (!response.ok) return null;

    const payload = await response.json();
    if (!payload || typeof payload !== 'object') return null;

    const results = (payload as { results?: unknown }).results;
    if (!Array.isArray(results)) return null;

    const result = results.find((value) => {
      if (!value || typeof value !== 'object') return false;
      const item = value as { bundleId?: unknown; trackId?: unknown };
      return item.trackId === Number(APP_STORE_ID) && item.bundleId === APP_BUNDLE_ID;
    }) as { version?: unknown } | undefined;

    return typeof result?.version === 'string' && versionParts(result.version)
      ? result.version
      : null;
  } catch {
    return null;
  }
}

export async function isAppUpdateAvailable(
  installedVersion: string | null,
  fetcher: Fetcher = fetch,
): Promise<boolean> {
  if (!installedVersion) return false;

  const latestVersion = await latestAppStoreVersion(fetcher);
  return latestVersion ? isNewerVersion(latestVersion, installedVersion) : false;
}
