import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  getAdminClient,
  jsonResponse,
  requireWebhookSecret,
  startOfTorontoToday,
  WebhookPayload,
} from "../_shared/common.ts";
import {
  checkDeliveryAndRetry,
  findPushToken,
  sendEmailFallback,
  sendPushNotification,
} from "../_shared/message-style-delivery.ts";

type GameRecord = {
  id: string;
  public_id: string;
  host_id: string | null;
  title: string | null;
  location_name: string | null;
  time: string | null;
  level: string | null;
  is_public: boolean;
  status: string;
  is_test: boolean;
  game_capacity: number | null;
  players_enrolled: number | null;
};

type NearbyUserRow = {
  user_id: string;
  distance_meters: number;
};

type NotificationPreferenceRow = {
  user_id: string;
  nearby_games: boolean;
  favourite_park_games: boolean;
  radius_meters: number;
};

const DAILY_NEARBY_GAME_LIMIT = 3;
const MAX_LOCATION_AGE_HOURS = 24;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code =
    "code" in error ? String((error as { code?: unknown }).code) : "";
  const message =
    "message" in error ? String((error as { message?: unknown }).message) : "";
  return code === "23505" || message.toLowerCase().includes("duplicate");
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    requireWebhookSecret(req);

    const payload = (await req.json()) as WebhookPayload<GameRecord>;
    const game = payload.record;

    if (
      payload.type !== "INSERT" ||
      payload.table !== "games" ||
      payload.schema !== "public" ||
      !game?.id ||
      !game.public_id ||
      !game.location_name
    ) {
      console.info("New game notification skipped", {
        reason: "Invalid webhook payload",
        eventType: payload.type,
        table: payload.table,
        schema: payload.schema,
        gameId: game?.id ?? null,
      });
      return jsonResponse({ skipped: true, reason: "Invalid webhook payload" });
    }

    if (
      game.is_public !== true ||
      game.status !== "scheduled" ||
      game.is_test === true
    ) {
      console.info("New game notification skipped", {
        gameId: game.id,
        reason: "Game is not an eligible public scheduled game",
      });
      return jsonResponse({
        skipped: true,
        reason: "Game is not an eligible public scheduled game",
      });
    }

    if (
      game.game_capacity !== null &&
      (game.players_enrolled ?? 0) >= game.game_capacity
    ) {
      return jsonResponse({
        skipped: true,
        reason: "Game is already at capacity",
      });
    }

    const supabase = getAdminClient();
    const locationName = game.location_name.trim();

    console.info("Processing nearby-game notification", {
      gameId: game.id,
      hostId: game.host_id,
      locationName,
    });

    const { data: preferenceRows, error: prefsError } = await supabase
      .from("notification_preferences")
      .select("user_id, nearby_games, favourite_park_games, radius_meters")
      .or("nearby_games.eq.true,favourite_park_games.eq.true");

    if (prefsError) {
      console.error("Could not load nearby-game notification preferences", {
        gameId: game.id,
        error: prefsError.message,
        code: prefsError.code,
      });
      throw prefsError;
    }

    const preferences = (preferenceRows ?? []) as NotificationPreferenceRow[];
    const preferenceByUserId = new Map(
      preferences.map((preference) => [preference.user_id, preference]),
    );
    const nearbyPreferences = preferences.filter(
      (preference) =>
        preference.nearby_games && preference.user_id !== game.host_id,
    );
    const maxRadiusMeters = Math.max(
      0,
      ...nearbyPreferences.map((preference) => preference.radius_meters),
    );

    let nearbyUsers: NearbyUserRow[] = [];
    if (maxRadiusMeters > 0) {
      const { data, error } = await supabase.rpc(
        "get_nearby_users_for_game_v1",
        {
          p_game_id: game.id,
          p_radius_meters: maxRadiusMeters,
          p_max_age_hours: MAX_LOCATION_AGE_HOURS,
        },
      );

      if (error) {
        console.error("Could not resolve nearby users", {
          gameId: game.id,
          error: error.message,
          code: error.code,
        });
        throw error;
      }

      nearbyUsers = (data ?? []) as NearbyUserRow[];
    }

    const candidateUserIds = new Set<string>();
    nearbyUsers.forEach((nearbyUser) => {
      const preference = preferenceByUserId.get(nearbyUser.user_id);
      if (
        preference?.nearby_games &&
        nearbyUser.distance_meters <= preference.radius_meters
      ) {
        candidateUserIds.add(nearbyUser.user_id);
      }
    });

    const nearbyResolvedUserIds = new Set(
      nearbyUsers.map((user) => user.user_id),
    );
    const favoriteParkFallbackIds = preferences
      .filter(
        (preference) =>
          preference.favourite_park_games &&
          preference.user_id !== game.host_id &&
          !nearbyResolvedUserIds.has(preference.user_id),
      )
      .map((preference) => preference.user_id);

    if (favoriteParkFallbackIds.length > 0) {
      const { data: fallbackUsers, error: fallbackError } = await supabase
        .from("users")
        .select("id")
        .in("id", favoriteParkFallbackIds)
        .eq("favorite_park", locationName);

      if (fallbackError) throw fallbackError;
      (fallbackUsers ?? []).forEach((user) => candidateUserIds.add(user.id));
    }

    const resolvedCandidateUserIds = [...candidateUserIds];
    if (resolvedCandidateUserIds.length === 0) {
      return jsonResponse({
        success: true,
        fallbackRule:
          "Skip stale or missing locations unless an opted-in exact favorite park matches",
        eligibleUsers: 0,
        notificationCount: 0,
        pushAttemptCount: 0,
      });
    }

    const { data: enrolledPlayers, error: enrolledError } = await supabase
      .from("game_players")
      .select("user_id")
      .eq("game_id", game.id)
      .in("user_id", resolvedCandidateUserIds);

    if (enrolledError) {
      console.error("Could not load enrolled players for nearby-game filter", {
        gameId: game.id,
        error: enrolledError.message,
        code: enrolledError.code,
      });
      throw enrolledError;
    }

    const enrolledUserIds = new Set(
      (enrolledPlayers ?? [])
        .map((row) => row.user_id as string | null)
        .filter((id): id is string => Boolean(id)),
    );

    const blockedUserIds = new Set<string>();
    if (game.host_id) {
      const { data: blocks, error: blocksError } = await supabase
        .from("blocked_users")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${game.host_id},blocked_id.eq.${game.host_id}`);

      if (blocksError) throw blocksError;
      (blocks ?? []).forEach((block) => {
        if (block.blocker_id === game.host_id)
          blockedUserIds.add(block.blocked_id);
        if (block.blocked_id === game.host_id)
          blockedUserIds.add(block.blocker_id);
      });
    }

    const eligibleUserIds = resolvedCandidateUserIds.filter(
      (userId) => !enrolledUserIds.has(userId) && !blockedUserIds.has(userId),
    );

    console.info("Nearby-game recipients resolved", {
      gameId: game.id,
      locationCandidateCount: nearbyUsers.length,
      fallbackCandidateCount: favoriteParkFallbackIds.length,
      candidateUserCount: resolvedCandidateUserIds.length,
      eligibleUserCount: eligibleUserIds.length,
    });

    if (eligibleUserIds.length === 0) {
      return jsonResponse({
        success: true,
        eligibleUsers: 0,
        notificationCount: 0,
        pushAttemptCount: 0,
      });
    }

    const startOfDay = startOfTorontoToday();
    // DB uniqueness key only. Clients must not navigate from this string.
    const destination = `nearby_game:${game.id}`;
    const gameTime = game.time
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Toronto",
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(game.time))
      : null;

    const title = `New game at ${locationName}`;
    const skillLabel = game.level?.trim().toLowerCase();
    const body = gameTime
      ? `${skillLabel ? `A ${skillLabel}` : "A"} tennis game starts ${gameTime}.`
      : `${game.title?.trim() || "A new game"} was just created.`;
    const data = {
      type: "nearby_game",
      gameId: game.id,
      park: locationName,
    };
    const ctaUrl = `https://sportiner.com/g/${encodeURIComponent(game.public_id)}`;

    let notificationCount = 0;
    let pushAttemptCount = 0;
    let pushSentCount = 0;
    let limitedUsers = 0;
    let duplicateUsers = 0;
    let failedUsers = 0;

    for (const userId of eligibleUserIds) {
      const { count, error: countError } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("type", "nearby_game")
        .eq("push_sent", true)
        .gte("pushed_at", startOfDay);

      if (countError) {
        console.error("Could not check nearby-game daily limit", {
          gameId: game.id,
          recipientUserId: userId,
          error: countError.message,
          code: countError.code,
        });
        failedUsers += 1;
        continue;
      }

      if ((count ?? 0) >= DAILY_NEARBY_GAME_LIMIT) {
        limitedUsers += 1;
        continue;
      }

      const { data: existing, error: existingError } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "nearby_game")
        .eq("destination", destination)
        .limit(1)
        .maybeSingle();

      if (existingError) {
        console.error("Could not check duplicate nearby-game notification", {
          gameId: game.id,
          recipientUserId: userId,
          error: existingError.message,
          code: existingError.code,
        });
        failedUsers += 1;
        continue;
      }

      if (existing) {
        duplicateUsers += 1;
        continue;
      }

      try {
        const pushToken = await findPushToken(supabase, userId);
        const { data: notification, error: notificationError } = await supabase
          .from("notifications")
          .insert({
            user_id: userId,
            type: "nearby_game",
            content: body,
            destination,
            push_token_id: pushToken?.id ?? null,
            attempt_count: pushToken ? 1 : 0,
            last_attempt_at: pushToken ? new Date().toISOString() : null,
            read: false,
            push_sent: false,
          })
          .select("id")
          .single();

        if (notificationError || !notification) {
          if (isUniqueViolation(notificationError)) {
            duplicateUsers += 1;
            continue;
          }
          throw notificationError ?? new Error("Failed to create notification");
        }

        notificationCount += 1;

        if (!pushToken) {
          await sendEmailFallback(
            supabase,
            userId,
            title,
            "New game on Sportiner",
            `${body} Open Sportiner to view the game and join.`,
            ctaUrl,
          );
          continue;
        }

        pushAttemptCount += 1;
        const pushAccepted = await sendPushNotification(
          supabase,
          pushToken,
          title,
          body,
          notification.id,
          data,
        );

        if (pushAccepted) {
          pushSentCount += 1;
          const { error: pushUpdateError } = await supabase
            .from("notifications")
            .update({
              push_sent: true,
              pushed_at: new Date().toISOString(),
            })
            .eq("id", notification.id);

          if (pushUpdateError) {
            console.log("Failed to mark push as sent:", pushUpdateError);
          }
        }

        EdgeRuntime.waitUntil(
          checkDeliveryAndRetry(supabase, {
            notificationId: notification.id,
            initialPushAccepted: pushAccepted,
            receiverId: userId,
            pushToken,
            title,
            body,
            data,
            emailSubject: title,
            emailHeading: "New game on Sportiner",
            emailMessage: `${body} Open Sportiner to view the game and join.`,
            ctaUrl,
          }),
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          duplicateUsers += 1;
          continue;
        }

        console.error("Could not notify user about nearby game", {
          gameId: game.id,
          recipientUserId: userId,
          error: errorMessage(error),
        });
        failedUsers += 1;
      }
    }

    console.info("Nearby-game notification completed", {
      gameId: game.id,
      eligibleUserCount: eligibleUserIds.length,
      notificationCount,
      pushAttemptCount,
      pushSentCount,
      limitedUsers,
      duplicateUsers,
      failedUsers,
    });

    return jsonResponse(
      {
        success: failedUsers === 0,
        eligibleUsers: eligibleUserIds.length,
        notificationCount,
        pushAttemptCount,
        pushSentCount,
        limitedUsers,
        duplicateUsers,
        failedUsers,
        dailyLimit: DAILY_NEARBY_GAME_LIMIT,
      },
      failedUsers === eligibleUserIds.length ? 500 : 200,
    );
  } catch (error) {
    const message = errorMessage(error);
    console.error("notify-new-game failed", { error: message });
    return jsonResponse(
      { error: message },
      message === "Unauthorized webhook request" ? 401 : 500,
    );
  }
});
