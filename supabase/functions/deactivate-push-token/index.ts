import { createClient } from "jsr:@supabase/supabase-js@2";

type DisableRequest = {
  deviceId?: string;
  reason?: string;
};

type DisabledReason =
  | "logout"
  | "permission_revoked"
  | "account_switched"
  | "account_deleted"
  | "client_disabled";

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

function normalizeDisableReason(reason: string | undefined): DisabledReason {
  switch (reason) {
    case "logout":
    case "signed-out":
      return "logout";
    case "permission_revoked":
    case "permission-denied":
      return "permission_revoked";
    case "account_switched":
      return "account_switched";
    case "account_deleted":
      return "account_deleted";
    default:
      return "client_disabled";
  }
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

    const payload = (await req.json()) as DisableRequest;
    const deviceId = payload.deviceId?.trim() ?? "";

    if (!isValidDeviceId(deviceId)) {
      return jsonResponse(
        { success: false, error: "Invalid installation identifier" },
        400,
      );
    }

    const disabledReason = normalizeDisableReason(payload.reason?.trim());
    const now = new Date().toISOString();

    const { data: deactivatedRows, error } = await admin
      .from("push_tokens")
      .update({
        enabled: false,
        disabled_reason: disabledReason,
        updated_at: now,
      })
      .eq("user_id", user.id)
      .eq("device_id", deviceId)
      .select("id");

    if (error) {
      throw error;
    }

    return jsonResponse({
      success: true,
      deactivatedCount: deactivatedRows?.length ?? 0,
    });
  } catch (error) {
    console.error("deactivate-push-token failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return jsonResponse(
      {
        success: false,
        error: "Unable to deactivate push notification device",
      },
      500,
    );
  }
});
