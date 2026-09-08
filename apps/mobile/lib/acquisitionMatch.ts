import * as Device from 'expo-device';
import { Dimensions, Platform } from 'react-native';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Deliberately free of any value import of the Supabase client. `lib/supabase`
 * re-exports the client from `context/AuthContext` and evaluates
 * `isSupabaseConfigured` at module init, so importing it here would make
 * AuthContext → this module → lib/supabase → AuthContext a cycle and latch that
 * flag to false. The caller passes its own client instead, matching
 * `lib/pushNotifications`.
 */

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
export async function requestAcquisitionDeviceMatch(
  supabase: SupabaseClient,
): Promise<void> {
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
      console.warn('[acquisitionMatch] device match failed', error.message);
    }
  } catch (error) {
    console.warn('[acquisitionMatch] device match failed', error);
  }
}
