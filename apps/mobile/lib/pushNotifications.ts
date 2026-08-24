import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import type { SupabaseClient } from '@supabase/supabase-js';

const INSTALLATION_ID_KEY = 'sportiner_installation_id';
const LEGACY_INSTALLATION_ID_KEY = 'sportiner_push_installation_id';
const DISABLE_TIMEOUT_MS = 2_500;

export type NotificationPermissionState =
  | 'undetermined'
  | 'denied'
  | 'granted'
  | 'provisional'
  | 'ephemeral'
  | 'unsupported';

export type PushDisableReason =
  | 'logout'
  | 'permission_revoked'
  | 'account_switched'
  | 'account_deleted';

export type RegistrationResult =
  | { success: true; token: string; registrationId?: string }
  | {
      success: false;
      reason:
        | 'unsupported-platform'
        | 'not-a-device'
        | 'permission-not-requested'
        | 'permission-denied'
        | 'missing-project-id'
        | 'not-authenticated'
        | 'registration-failed';
      error?: unknown;
    };

type RegisterOptions = {
  requestPermission: boolean;
};

type RegisterPushTokenResponse = {
  success?: boolean;
  registration?: {
    id?: string;
    user_id?: string;
    device_id?: string;
    platform?: string;
    enabled?: boolean;
    last_registered_at?: string;
  };
  error?: string;
};

type DeactivatePushTokenResponse = {
  success?: boolean;
  deactivatedCount?: number;
  error?: string;
};

let registrationInFlight: Promise<RegistrationResult> | null = null;
let registrationPaused = false;

function isAllowedPermissionState(state: NotificationPermissionState): boolean {
  return state === 'granted' || state === 'provisional' || state === 'ephemeral';
}

export function permissionStateFromSettings(
  settings: Notifications.NotificationPermissionsStatus,
): NotificationPermissionState {
  // Sportiner push is iOS-only for now.
  if (Platform.OS !== 'ios') {
    return 'unsupported';
  }

  switch (settings.ios?.status) {
    case Notifications.IosAuthorizationStatus.AUTHORIZED:
      return 'granted';
    case Notifications.IosAuthorizationStatus.PROVISIONAL:
      return 'provisional';
    case Notifications.IosAuthorizationStatus.EPHEMERAL:
      return 'ephemeral';
    case Notifications.IosAuthorizationStatus.DENIED:
      return 'denied';
    default:
      return 'undetermined';
  }
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (Platform.OS !== 'ios') {
    return 'unsupported';
  }

  const settings = await Notifications.getPermissionsAsync();
  return permissionStateFromSettings(settings);
}

export async function getOrCreateInstallationId(): Promise<string> {
  const existingId = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (existingId) {
    return existingId;
  }

  // Migrate the previous key so registration and logout stay on the same row.
  const legacyId = await SecureStore.getItemAsync(LEGACY_INSTALLATION_ID_KEY);
  if (legacyId) {
    await SecureStore.setItemAsync(INSTALLATION_ID_KEY, legacyId);
    return legacyId;
  }

  const installationId = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, installationId);
  return installationId;
}

function expoProjectId(): string | null {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function performPushRegistration(
  supabase: SupabaseClient,
  options: RegisterOptions,
): Promise<RegistrationResult> {
  try {
    if (Platform.OS !== 'ios') {
      return { success: false, reason: 'unsupported-platform' };
    }

    if (!Device.isDevice) {
      return { success: false, reason: 'not-a-device' };
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.user) {
      return {
        success: false,
        reason: 'not-authenticated',
        error: sessionError,
      };
    }

    let settings = await Notifications.getPermissionsAsync();
    let permissionState = permissionStateFromSettings(settings);

    if (!isAllowedPermissionState(permissionState) && options.requestPermission) {
      settings = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      permissionState = permissionStateFromSettings(settings);
    }

    if (!isAllowedPermissionState(permissionState)) {
      if (permissionState === 'denied') {
        await disablePushTokensForCurrentDevice(supabase, 'permission_revoked');
        return { success: false, reason: 'permission-denied' };
      }

      return { success: false, reason: 'permission-not-requested' };
    }

    const projectId = expoProjectId();
    if (!projectId) {
      return { success: false, reason: 'missing-project-id' };
    }

    const expoPushToken = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;
    const deviceId = await getOrCreateInstallationId();

    const { data, error } = await supabase.functions.invoke<RegisterPushTokenResponse>(
      'register-push-token',
      {
        body: {
          expoPushToken,
          deviceId,
          platform: 'ios',
        },
      },
    );

    if (error || data?.success !== true || !data.registration?.id) {
      throw error ?? new Error(data?.error ?? 'Push-token registration failed');
    }

    return {
      success: true,
      token: expoPushToken,
      registrationId: data.registration.id,
    };
  } catch (error) {
    console.warn('Push registration failed', error);
    return { success: false, reason: 'registration-failed', error };
  }
}

export function registerPushNotifications(
  supabase: SupabaseClient,
  options: RegisterOptions,
): Promise<RegistrationResult> {
  if (registrationPaused) {
    return Promise.resolve({ success: false, reason: 'not-authenticated' });
  }

  if (registrationInFlight) {
    return registrationInFlight;
  }

  const registration = performPushRegistration(supabase, options);
  registrationInFlight = registration;
  void registration.finally(() => {
    if (registrationInFlight === registration) {
      registrationInFlight = null;
    }
  });
  return registration;
}

export async function pausePushRegistrationForLogout(): Promise<void> {
  registrationPaused = true;
  await registrationInFlight;
}

export function resumePushRegistrationAfterLogout(): void {
  registrationPaused = false;
}

export async function disablePushTokensForCurrentDevice(
  supabase: SupabaseClient,
  reason: PushDisableReason,
): Promise<boolean> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    return false;
  }

  try {
    const deviceId = await getOrCreateInstallationId();
    const disableRequest = supabase.functions.invoke<DeactivatePushTokenResponse>(
      'deactivate-push-token',
      {
        body: {
          deviceId,
          reason,
        },
      },
    );

    const result = await withTimeout(disableRequest, DISABLE_TIMEOUT_MS);
    if (!result) {
      console.warn('Push-token deactivation timed out');
      return false;
    }

    const { data, error } = result;
    if (error || data?.success !== true) {
      throw error ?? new Error(data?.error ?? 'Push-token deactivation failed');
    }

    if ((data.deactivatedCount ?? 0) === 0) {
      console.warn('Push-token deactivation matched zero rows', {
        reason,
      });
    }

    return true;
  } catch (error) {
    console.warn('Failed to disable this device push token', error);
    return false;
  }
}
