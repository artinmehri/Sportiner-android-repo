import * as Location from "expo-location";

import { supabase } from "@/lib/supabase";

export type LatestLocationSource =
  | "onboarding"
  | "app_open"
  | "app_foreground"
  | "nearby_games"
  | "create_game"
  | "join_game";

export type LatestLocationResult =
  | { success: true; updatedAt: string | null }
  | {
      success: false;
      reason:
        | "not_authenticated"
        | "permission_denied"
        | "location_unavailable"
        | "inaccurate_location"
        | "invalid_location"
        | "throttled"
        | "request_failed";
    };

type RefreshOptions = {
  force?: boolean;
};

const LOCATION_REQUEST_TIMEOUT_MS = 12_000;
const LOCATION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ACCEPTED_ACCURACY_METERS = 2_000;

const lastReportedAtByUser = new Map<string, number>();
const inFlightByUser = new Map<string, Promise<LatestLocationResult>>();
const clearedForDeniedPermission = new Set<string>();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validatePosition(
  position: Location.LocationObject,
): { latitude: number; longitude: number; accuracy: number } | null {
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  const accuracy = position.coords.accuracy;

  if (
    !isFiniteNumber(latitude) ||
    !isFiniteNumber(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  if (
    !isFiniteNumber(accuracy) ||
    accuracy < 0 ||
    accuracy > MAX_ACCEPTED_ACCURACY_METERS
  ) {
    return null;
  }

  return { latitude, longitude, accuracy };
}

async function currentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user.id) {
    return null;
  }

  return data.session.user.id;
}

async function clearDeniedLocation(userId: string): Promise<void> {
  if (clearedForDeniedPermission.has(userId)) {
    return;
  }

  const { error } = await supabase.rpc("clear_latest_user_location_v1");
  if (error) {
    console.warn("Unable to clear location after permission denial", {
      code: error.code,
    });
    return;
  }

  clearedForDeniedPermission.add(userId);
  lastReportedAtByUser.delete(userId);
}

async function persistPosition(
  userId: string,
  position: Location.LocationObject,
  source: LatestLocationSource,
): Promise<LatestLocationResult> {
  const validated = validatePosition(position);
  if (!validated) {
    const accuracy = position.coords.accuracy;
    return {
      success: false,
      reason:
        isFiniteNumber(accuracy) && accuracy > MAX_ACCEPTED_ACCURACY_METERS
          ? "inaccurate_location"
          : "invalid_location",
    };
  }

  const { data, error } = await supabase.rpc("upsert_latest_user_location_v1", {
    p_latitude: validated.latitude,
    p_longitude: validated.longitude,
    p_accuracy_meters: validated.accuracy,
    p_source: source,
  });

  if (error) {
    console.warn("Unable to store latest location", {
      source,
      code: error.code,
    });
    return { success: false, reason: "request_failed" };
  }

  lastReportedAtByUser.set(userId, Date.now());
  clearedForDeniedPermission.delete(userId);

  const updatedAt =
    data &&
    typeof data === "object" &&
    "updatedAt" in data &&
    typeof data.updatedAt === "string"
      ? data.updatedAt
      : null;

  return { success: true, updatedAt };
}

export async function saveLatestLocationPosition(
  position: Location.LocationObject,
  source: LatestLocationSource,
): Promise<LatestLocationResult> {
  try {
    const userId = await currentUserId();
    if (!userId) {
      return { success: false, reason: "not_authenticated" };
    }

    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      await clearDeniedLocation(userId);
      return { success: false, reason: "permission_denied" };
    }

    return await persistPosition(userId, position, source);
  } catch (error) {
    console.warn("Unable to save latest location", {
      source,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { success: false, reason: "request_failed" };
  }
}

export async function refreshLatestLocation(
  source: LatestLocationSource,
  options: RefreshOptions = {},
): Promise<LatestLocationResult> {
  const userId = await currentUserId();
  if (!userId) {
    return { success: false, reason: "not_authenticated" };
  }

  const existingRequest = inFlightByUser.get(userId);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async (): Promise<LatestLocationResult> => {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        await clearDeniedLocation(userId);
        return { success: false, reason: "permission_denied" };
      }

      clearedForDeniedPermission.delete(userId);

      const lastReportedAt = lastReportedAtByUser.get(userId) ?? 0;
      if (
        !options.force &&
        Date.now() - lastReportedAt < LOCATION_REFRESH_INTERVAL_MS
      ) {
        return { success: false, reason: "throttled" };
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        return { success: false, reason: "location_unavailable" };
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const position = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error("Location request timed out")),
              LOCATION_REQUEST_TIMEOUT_MS,
            );
          }),
        ]);

        return await persistPosition(userId, position, source);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      console.warn("Latest location refresh failed", {
        source,
        error: error instanceof Error ? error.message : "unknown",
      });
      return { success: false, reason: "request_failed" };
    }
  })();

  inFlightByUser.set(userId, request);
  try {
    return await request;
  } finally {
    if (inFlightByUser.get(userId) === request) {
      inFlightByUser.delete(userId);
    }
  }
}
