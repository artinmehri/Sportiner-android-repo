import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  getAdminClient,
  jsonResponse,
  requireWebhookSecret,
  WebhookPayload,
} from "../_shared/common.ts";
import {
  checkDeliveryAndRetry,
  findPushToken,
  sendEmailFallback,
  sendPushNotification,
} from "../_shared/message-style-delivery.ts";

type GamePlayerRecord = {
  id: string;
  game_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

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

    const payload = (await req.json()) as WebhookPayload<GamePlayerRecord>;
    const gamePlayer = payload.record;

    if (
      payload.type !== "INSERT" ||
      payload.table !== "game_players" ||
      payload.schema !== "public" ||
      !gamePlayer?.id ||
      !gamePlayer.game_id ||
      !gamePlayer.user_id
    ) {
      console.info("Player joined notification skipped", {
        reason: "Invalid webhook payload",
        eventType: payload.type,
        table: payload.table,
        schema: payload.schema,
        gamePlayerId: gamePlayer?.id ?? null,
      });
      return jsonResponse({ skipped: true, reason: "Invalid webhook payload" });
    }

    console.info("Processing joined player", {
      gamePlayerId: gamePlayer.id,
      gameId: gamePlayer.game_id,
      playerId: gamePlayer.user_id,
    });

    const supabase = getAdminClient();
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, public_id, host_id, title, location_name")
      .eq("id", gamePlayer.game_id)
      .maybeSingle();

    if (gameError) {
      console.error("Could not load joined player's game", {
        gamePlayerId: gamePlayer.id,
        gameId: gamePlayer.game_id,
        error: gameError.message,
        code: gameError.code,
      });
      throw gameError;
    }

    if (!game?.host_id) {
      console.info("Player joined notification skipped", {
        gamePlayerId: gamePlayer.id,
        gameId: gamePlayer.game_id,
        reason: "Game or host not found",
      });
      return jsonResponse({ skipped: true, reason: "Game or host not found" });
    }

    if (game.host_id === gamePlayer.user_id) {
      console.info("Player joined notification skipped", {
        gamePlayerId: gamePlayer.id,
        gameId: gamePlayer.game_id,
        playerId: gamePlayer.user_id,
        reason: "Host joined own game",
      });
      return jsonResponse({ skipped: true, reason: "Host joined own game" });
    }

    const { data: player, error: playerError } = await supabase
      .from("users")
      .select("name")
      .eq("id", gamePlayer.user_id)
      .maybeSingle();

    if (playerError) {
      console.error("Could not load joined player", {
        gamePlayerId: gamePlayer.id,
        playerId: gamePlayer.user_id,
        error: playerError.message,
        code: playerError.code,
      });
      throw playerError;
    }

    const playerName = player?.name?.trim() || "A player";
    const gameLabel =
      game.title?.trim() || game.location_name?.trim() || "your game";
    const body = `${playerName} joined ${gameLabel}`;
    const title = "Someone joined your game";
    const data = {
      type: "player_joined",
      gameId: game.id,
      playerId: gamePlayer.user_id,
      gamePlayerId: gamePlayer.id,
    };
    const ctaUrl = `https://sportiner.com/g/${encodeURIComponent(game.public_id)}`;
    // DB uniqueness key only. Clients must not navigate from this string.
    const destination = `player_joined:${gamePlayer.id}`;

    const { data: existing, error: existingError } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", game.host_id)
      .eq("type", "player_joined")
      .eq("destination", destination)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error("Could not check duplicate player joined notification", {
        gamePlayerId: gamePlayer.id,
        gameId: game.id,
        hostId: game.host_id,
        error: existingError.message,
        code: existingError.code,
      });
      throw existingError;
    }

    if (existing) {
      console.info("Player joined notification skipped", {
        gamePlayerId: gamePlayer.id,
        gameId: game.id,
        hostId: game.host_id,
        reason: "Duplicate webhook delivery",
      });
      return jsonResponse({
        success: true,
        duplicate: true,
        notificationCount: 0,
        pushAttemptCount: 0,
      });
    }

    const { data: preference, error: preferenceError } = await supabase
      .from("notification_preferences")
      .select("host_updates")
      .eq("user_id", game.host_id)
      .maybeSingle();

    if (preferenceError) {
      console.log("Failed to get host update preference:", preferenceError);
    }

    const pushEnabled = preference?.host_updates ?? true;
    const pushToken = pushEnabled
      ? await findPushToken(supabase, game.host_id)
      : null;

    try {
      const { data: notification, error: notificationError } = await supabase
        .from("notifications")
        .insert({
          user_id: game.host_id,
          type: "player_joined",
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
        throw notificationError ?? new Error("Failed to create notification");
      }

      if (!pushEnabled) {
        EdgeRuntime.waitUntil(
          sendEmailFallback(
            supabase,
            game.host_id,
            title,
            "New player on Sportiner",
            `${body}. Open Sportiner to view your game.`,
            ctaUrl,
          ),
        );

        return jsonResponse({
          success: true,
          notificationCount: 1,
          notificationId: notification.id,
          pushSent: false,
          pushAttemptCount: 0,
        });
      }

      if (!pushToken) {
        await sendEmailFallback(
          supabase,
          game.host_id,
          title,
          "New player on Sportiner",
          `${body}. Open Sportiner to view your game.`,
          ctaUrl,
        );

        return jsonResponse({
          success: true,
          notificationCount: 1,
          notificationId: notification.id,
          pushSent: false,
          pushAttemptCount: 0,
        });
      }

      const pushAccepted = await sendPushNotification(
        supabase,
        pushToken,
        title,
        body,
        notification.id,
        data,
      );

      if (pushAccepted) {
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
          receiverId: game.host_id,
          pushToken,
          title,
          body,
          data,
          emailSubject: title,
          emailHeading: "New player on Sportiner",
          emailMessage: `${body}. Open Sportiner to view your game.`,
          ctaUrl,
        }),
      );

      console.info("Player joined notification completed", {
        gamePlayerId: gamePlayer.id,
        gameId: game.id,
        playerId: gamePlayer.user_id,
        hostId: game.host_id,
        notificationCount: 1,
        pushAttemptCount: 1,
        pushSent: pushAccepted,
      });

      return jsonResponse({
        success: true,
        notificationCount: 1,
        notificationId: notification.id,
        pushSent: pushAccepted,
        pushAttemptCount: 1,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        console.info("Player joined notification skipped", {
          gamePlayerId: gamePlayer.id,
          gameId: game.id,
          hostId: game.host_id,
          reason: "Duplicate webhook delivery",
        });
        return jsonResponse({
          success: true,
          duplicate: true,
          notificationCount: 0,
          pushAttemptCount: 0,
        });
      }
      throw error;
    }
  } catch (error) {
    const message = errorMessage(error);
    console.error("notify-player-joined failed", { error: message });
    return jsonResponse(
      { error: message },
      message === "Unauthorized webhook request" ? 401 : 500,
    );
  }
});
