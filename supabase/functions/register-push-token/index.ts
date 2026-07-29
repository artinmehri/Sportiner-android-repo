import { createClient } from "jsr:@supabase/supabase-js@2";

type RegisterRequest = {
  expoPushToken?: string;
  deviceId?: string;
  platform?: string;
};

const EXPO_PUSH_TOKEN_RE = /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string | null {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

function isValidDeviceId(deviceId: string): boolean {
  return deviceId.length >= 8 && deviceId.length <= 200;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const token = bearerToken(req);

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment is not configured");
    }

    if (!token) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const payload = (await req.json()) as RegisterRequest;
    const expoPushToken = payload.expoPushToken?.trim() ?? "";
    const deviceId = payload.deviceId?.trim() ?? "";
    const platform = payload.platform?.trim() ?? "";

    if (!EXPO_PUSH_TOKEN_RE.test(expoPushToken)) {
      return jsonResponse(
        { success: false, error: "Invalid Expo push token" },
        400,
      );
    }

    if (!isValidDeviceId(deviceId)) {
      return jsonResponse(
        { success: false, error: "Invalid installation identifier" },
        400,
      );
    }

    // Sportiner currently ships push for iOS only.
    if (platform !== "ios") {
      return jsonResponse({ success: false, error: "Invalid platform" }, 400);
    }

    const now = new Date().toISOString();

    // Move this Expo token / installation away from any other account.
    const { error: reassignmentError } = await admin
      .from("push_tokens")
      .update({
        enabled: false,
        disabled_reason: "account_switched",
        updated_at: now,
      })
      .neq("user_id", user.id)
      .or(`device_id.eq.${deviceId},expo_push_token.eq.${expoPushToken}`)
      .eq("enabled", true);

    if (reassignmentError) {
      throw reassignmentError;
    }

    const { data: registration, error: upsertError } = await admin
      .from("push_tokens")
      .upsert(
        {
          user_id: user.id,
          expo_push_token: expoPushToken,
          device_id: deviceId,
          platform: "ios",
          enabled: true,
          disabled_reason: null,
          last_registered_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,device_id" },
      )
      .select(
        "id, user_id, device_id, platform, enabled, disabled_reason, last_registered_at, created_at, updated_at",
      )
      .single();

    if (upsertError) {
      throw upsertError;
    }

    return jsonResponse({
      success: true,
      registration,
    });
  } catch (error) {
    console.error("register-push-token failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return jsonResponse(
      { success: false, error: "Unable to register push notification device" },
      500,
    );
  }
});
