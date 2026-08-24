import { getAdminClient, createAndSendNotification, jsonResponse } from "../_shared/common.ts";

const EXPO_PUSH_TOKEN_RE = /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/;
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TARGET_USERS = 500;
const CATEGORIES = new Set(["marketing", "operational"]);

type BroadcastCategory = "marketing" | "operational";

type PushTokenRow = {
  user_id: string;
  expo_push_token: string;
};

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

function textValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const valueTrimmed = value.trim();
  return valueTrimmed ? valueTrimmed.slice(0, maxLength) : null;
}

async function loadEligibleTokens(
  admin: ReturnType<typeof getAdminClient>,
  category: BroadcastCategory,
  targetUserIds: Set<string> | null,
): Promise<PushTokenRow[]> {
  const { data: tokenRows, error: tokenError } = await admin
    .from("push_tokens")
    .select("user_id, expo_push_token")
    .eq("enabled", true);

  if (tokenError) throw new Error(`Could not load push tokens: ${tokenError.message}`);

  let marketingUserIds: Set<string> | null = null;
  if (category === "marketing") {
    const { data: preferenceRows, error: preferenceError } = await admin
      .from("notification_preferences")
      .select("user_id")
      .eq("marketing_updates", true);

    if (preferenceError) {
      throw new Error(`Could not load notification preferences: ${preferenceError.message}`);
    }

    marketingUserIds = new Set((preferenceRows ?? []).map((row) => row.user_id));
  }

  const uniqueTokens = new Map<string, PushTokenRow>();
  for (const row of (tokenRows ?? []) as PushTokenRow[]) {
    if (!row.user_id || !EXPO_PUSH_TOKEN_RE.test(row.expo_push_token)) continue;
    if (targetUserIds && !targetUserIds.has(row.user_id)) continue;
    if (marketingUserIds && !marketingUserIds.has(row.user_id)) continue;
    if (!uniqueTokens.has(row.expo_push_token)) {
      uniqueTokens.set(row.expo_push_token, row);
    }
  }

  return [...uniqueTokens.values()];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = bearerToken(request);
  if (!token) return jsonResponse({ error: "Missing bearer token" }, 401);

  try {
    const admin = getAdminClient();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { data: isAdmin, error: adminError } = await admin.rpc("is_broadcast_admin_v1", {
      p_user_id: authData.user.id,
    });
    if (adminError || isAdmin !== true) return jsonResponse({ error: "Forbidden" }, 403);

    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    const title = textValue(payload?.title, 120);
    const body = textValue(payload?.body, 2000);
    const category = payload?.category === undefined ? "operational" : payload.category;
    const dryRun = payload?.dry_run !== false;
    let targetUserIds: Set<string> | null = null;

    if (payload?.user_ids !== undefined) {
      if (!Array.isArray(payload.user_ids) || payload.user_ids.length === 0 || payload.user_ids.length > MAX_TARGET_USERS) {
        return jsonResponse({ error: `user_ids must be a non-empty array of at most ${MAX_TARGET_USERS} UUIDs` }, 400);
      }

      targetUserIds = new Set<string>();
      for (const userId of payload.user_ids) {
        if (typeof userId !== "string" || !USER_ID_RE.test(userId)) {
          return jsonResponse({ error: "user_ids must contain only UUIDs" }, 400);
        }
        targetUserIds.add(userId.toLowerCase());
      }
    }

    if (!title || !body) {
      return jsonResponse({ error: "title and body are required" }, 400);
    }
    if (typeof category !== "string" || !CATEGORIES.has(category)) {
      return jsonResponse({ error: "category must be marketing or operational" }, 400);
    }

    const eligibleTokens = await loadEligibleTokens(admin, category as BroadcastCategory, targetUserIds);
    const eligibleUsers = new Set(eligibleTokens.map((row) => row.user_id));
    const summary = {
      category,
      audience: targetUserIds ? "targeted_users" : "all_eligible_users",
      requested_users: targetUserIds?.size ?? null,
      eligible_users: eligibleUsers.size,
      excluded_requested_users: targetUserIds
        ? [...targetUserIds].filter((userId) => !eligibleUsers.has(userId)).length
        : null,
      enabled_token_rows_considered: eligibleTokens.length,
      unique_device_tokens: eligibleTokens.length,
      estimated_pushes: eligibleTokens.length,
      dry_run: dryRun,
    };

    if (dryRun) return jsonResponse(summary);

    const broadcastId = crypto.randomUUID();
    const results = [];
    for (const userId of eligibleUsers) {
      results.push(await createAndSendNotification(admin, {
        userId,
        type: `broadcast_${category}`,
        content: body,
        destination: `broadcast:${broadcastId}`,
        title,
        body,
        data: { broadcast_id: broadcastId, category },
      }));
    }

    return jsonResponse({
      ...summary,
      dry_run: false,
      broadcast_id: broadcastId,
      notifications_created: results.length,
      pushes_attempted: results.reduce((total, result) => total + result.pushAttemptCount, 0),
    });
  } catch (error) {
    console.error("Broadcast notification failed", error);
    return jsonResponse({ error: "Broadcast notification failed" }, 500);
  }
});
