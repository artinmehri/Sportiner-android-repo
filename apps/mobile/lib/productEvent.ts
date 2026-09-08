import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { Dimensions, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import type { ParsedGameLinkChannel } from '@/lib/gameLinkChannel';

type GameLinkOpenedInput = {
  gamePublicId: string | null;
  channel: ParsedGameLinkChannel | null;
  shareCodePresent: boolean;
  resolutionState: string;
  entrySurface?: 'universal_link' | 'custom_scheme';
};

type GameViewedInput = {
  gamePublicId: string;
  viewSurface?: string;
};

const ANONYMOUS_ID_KEY = '@sportiner/analytics/anonymous_id';
let anonymousIdPromise: Promise<string> | null = null;

function isUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

async function getAnonymousId(): Promise<string> {
  if (!anonymousIdPromise) {
    anonymousIdPromise = AsyncStorage.getItem(ANONYMOUS_ID_KEY).then(async (existingId) => {
      if (isUuid(existingId)) {
        return existingId;
      }

      const newId = Crypto.randomUUID();
      await AsyncStorage.setItem(ANONYMOUS_ID_KEY, newId);
      return newId;
    });
  }

  return anonymousIdPromise;
}

async function getProductEventContext(): Promise<{
  anonymousId: string;
  platform: 'ios' | 'android';
  accessToken: string | null;
}> {
  const [anonymousId, { data: sessionData }] = await Promise.all([
    getAnonymousId(),
    supabase.auth.getSession(),
  ]);

  return {
    anonymousId,
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'ios',
    accessToken: sessionData.session?.access_token ?? null,
  };
}

/**
 * Fire-and-forget product event ingest. Never throws to callers.
 *
 * When the opener is signed in on iOS/Android, the session JWT is attached so
 * product-event can persist their Supabase user_id on the product_events row.
 */
export async function emitGameLinkOpenedEvent(input: GameLinkOpenedInput): Promise<void> {
  try {
    const eventId = Crypto.randomUUID();
    const { anonymousId, platform, accessToken } = await getProductEventContext();

    const { error } = await supabase.functions.invoke('product-event', {
      ...(accessToken
        ? {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        : {}),
      body: {
        event_name: 'game_link_opened',
        event_id: eventId,
        anonymous_id: anonymousId,
        platform,
        ...(input.channel ? { channel_hint: input.channel.channel } : {}),
        properties: {
          entry_surface: input.entrySurface ?? 'universal_link',
          resolution_state: input.resolutionState,
          share_code_present: input.shareCodePresent,
          ...(input.gamePublicId ? { game_public_id: input.gamePublicId } : {}),
          ...(input.channel ? { channel_code: input.channel.code } : {}),
        },
      },
    });

    if (error) {
      console.warn('[productEvent] game_link_opened failed', error.message);
    }
  } catch (error) {
    console.warn('[productEvent] game_link_opened failed', error);
  }
}

function deviceTypeLabel(): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  switch (Device.deviceType) {
    case Device.DeviceType.PHONE:
      return 'mobile';
    case Device.DeviceType.TABLET:
      return 'tablet';
    case Device.DeviceType.DESKTOP:
      return 'desktop';
    default:
      return 'unknown';
  }
}

/** No expo-localization in this app; Intl is the only cross-platform locale source. */
function deviceLanguage(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || null;
  } catch {
    return null;
  }
}

/**
 * `screen`, not `window` — the web side reports full screen size, and `window`
 * excludes the status bar, so the two would never agree on the same device.
 */
function screenResolution(): string {
  const { width, height } = Dimensions.get('screen');
  return `${Math.round(width)}x${Math.round(height)}`;
}

/**
 * Ask the server to match this signup against a recent anonymous web visit.
 * Fire-and-forget: attribution must never block someone finishing onboarding.
 */
export async function requestAcquisitionDeviceMatch(): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      // record_acquisition_attribution_v1 attaches the user from auth.uid().
      return;
    }

    const { error } = await supabase.functions.invoke('product-event', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        action: 'match_acquisition',
        platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'ios',
        device_type: deviceTypeLabel(),
        device_language: deviceLanguage(),
        screen_resolution: screenResolution(),
      },
    });

    if (error) {
      console.warn('[productEvent] acquisition match failed', error.message);
    }
  } catch (error) {
    console.warn('[productEvent] acquisition match failed', error);
  }
}

export async function emitGameViewedEvent(input: GameViewedInput): Promise<void> {
  try {
    const { anonymousId, platform, accessToken } = await getProductEventContext();
    const { error } = await supabase.functions.invoke('product-event', {
      ...(accessToken
        ? {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        : {}),
      body: {
        event_name: 'game_viewed',
        event_id: Crypto.randomUUID(),
        anonymous_id: anonymousId,
        platform,
        properties: {
          game_public_id: input.gamePublicId,
          view_surface: input.viewSurface ?? 'game_details',
        },
      },
    });

    if (error) {
      console.warn('[productEvent] game_viewed failed', error.message);
    }
  } catch (error) {
    console.warn('[productEvent] game_viewed failed', error);
  }
}
