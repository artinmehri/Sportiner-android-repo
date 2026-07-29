import {
  createAndSendNotification,
  getAdminClient,
  jsonResponse,
  requireWebhookSecret,
  startOfTorontoToday,
  WebhookPayload,
} from "../_shared/common.ts";

type GameRecord = {
  id: string;
  host_id: string | null;
  title: string | null;
  location_name: string | null;
  time: string | null;
  is_public: boolean;
  status: string;
  is_test: boolean;
};

const DAILY_FAVORITE_PARK_LIMIT = 3;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code) : "";
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

    const supabase = getAdminClient();
    const locationName = game.location_name.trim();

    console.info("Processing favorite-park game", {
      gameId: game.id,
      hostId: game.host_id,
      locationName,
    });

    let usersQuery = supabase
      .from("users")
      .select("id")
      .eq("favorite_park", locationName)
      .not("favorite_park", "is", null);

    if (game.host_id) usersQuery = usersQuery.neq("id", game.host_id);

    const { data: matchingUsers, error: usersError } = await usersQuery;
    if (usersError) {
      console.error("Could not load users for favorite park", {
        gameId: game.id,
        locationName,
        error: usersError.message,
        code: usersError.code,
      });
      throw usersError;
    }

    const candidateUserIds = [...new Set((matchingUsers ?? []).map((user) => user.id))];
    if (candidateUserIds.length === 0) {
      console.info("New game notification skipped", {
        gameId: game.id,
        reason: "No users match favorite park",
      });
      return jsonResponse({
        success: true,
        eligibleUsers: 0,
        notificationCount: 0,
        pushAttemptCount: 0,
      });
    }

    const { data: optedInPrefs, error: prefsError } = await supabase
      .from("notification_preferences")
      .select("user_id")
      .eq("favourite_park_games", true)
      .in("user_id", candidateUserIds);

    if (prefsError) {
      console.error("Could not load favorite-park notification preferences", {
        gameId: game.id,
        error: prefsError.message,
        code: prefsError.code,
      });
      throw prefsError;
    }

    const optedInUserIds = new Set(
      (optedInPrefs ?? []).map((row) => row.user_id as string),
    );

    const { data: enrolledPlayers, error: enrolledError } = await supabase
      .from("game_players")
      .select("user_id")
      .eq("game_id", game.id)
      .in("user_id", candidateUserIds);

    if (enrolledError) {
      console.error("Could not load enrolled players for favorite-park filter", {
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

    const eligibleUserIds = candidateUserIds.filter(
      (userId) => optedInUserIds.has(userId) && !enrolledUserIds.has(userId),
    );

    console.info("Favorite-park recipients resolved", {
      gameId: game.id,
      candidateUserCount: candidateUserIds.length,
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
    // DB uniqueness key only — clients must not navigate from this string.
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
    const body = gameTime
      ? `${game.title?.trim() || "A game"} starts ${gameTime}.`
      : `${game.title?.trim() || "A new game"} was just created.`;

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
        console.error("Could not check favorite-park daily limit", {
          gameId: game.id,
          recipientUserId: userId,
          error: countError.message,
          code: countError.code,
        });
        failedUsers += 1;
        continue;
      }

      if ((count ?? 0) >= DAILY_FAVORITE_PARK_LIMIT) {
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
        console.error("Could not check duplicate favorite-park notification", {
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
        const result = await createAndSendNotification(supabase, {
          userId,
          type: "nearby_game",
          content: body,
          destination,
          title,
          body,
          data: {
            type: "nearby_game",
            gameId: game.id,
            park: locationName,
          },
        });
        notificationCount += 1;
        pushAttemptCount += result.pushAttemptCount;
        if (result.pushSent) pushSentCount += 1;
      } catch (error) {
        if (isUniqueViolation(error)) {
          duplicateUsers += 1;
          continue;
        }

        console.error("Could not notify user about favorite-park game", {
          gameId: game.id,
          recipientUserId: userId,
          error: errorMessage(error),
        });
        failedUsers += 1;
      }
    }

    console.info("Favorite-park notification completed", {
      gameId: game.id,
      eligibleUserCount: eligibleUserIds.length,
      notificationCount,
      pushAttemptCount,
      pushSentCount,
      limitedUsers,
      duplicateUsers,
      failedUsers,
    });

    return jsonResponse({
      success: failedUsers === 0,
      eligibleUsers: eligibleUserIds.length,
      notificationCount,
      pushAttemptCount,
      pushSentCount,
      limitedUsers,
      duplicateUsers,
      failedUsers,
      dailyLimit: DAILY_FAVORITE_PARK_LIMIT,
    });
  } catch (error) {
    const message = errorMessage(error);
    console.error("notify-new-game failed", { error: message });
    return jsonResponse(
      { error: message },
      message === "Unauthorized webhook request" ? 401 : 500,
    );
  }
});
