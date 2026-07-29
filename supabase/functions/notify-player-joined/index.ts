import {
  createAndSendNotification,
  getAdminClient,
  jsonResponse,
  requireWebhookSecret,
  WebhookPayload,
} from "../_shared/common.ts";

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
      .select("id, host_id, title, location_name")
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

    const result = await createAndSendNotification(supabase, {
      userId: game.host_id,
      type: "player_joined",
      content: `${playerName} joined ${gameLabel}`,
      // DB uniqueness key only — clients must not navigate from this string.
      destination: `player_joined:${gamePlayer.id}`,
      title: "Someone joined your game",
      body: `${playerName} joined ${gameLabel}`,
      data: {
        type: "player_joined",
        gameId: game.id,
        playerId: gamePlayer.user_id,
        gamePlayerId: gamePlayer.id,
      },
    });

    console.info("Player joined notification completed", {
      gamePlayerId: gamePlayer.id,
      gameId: game.id,
      playerId: gamePlayer.user_id,
      hostId: game.host_id,
      notificationCount: 1,
      pushAttemptCount: result.pushAttemptCount,
      pushSent: result.pushSent,
    });

    return jsonResponse({
      success: true,
      notificationCount: 1,
      ...result,
    });
  } catch (error) {
    const message = errorMessage(error);
    console.error("notify-player-joined failed", { error: message });
    return jsonResponse(
      { error: message },
      message === "Unauthorized webhook request" ? 401 : 500,
    );
  }
});
