import {
  getAdminClient,
  jsonResponse,
  requireWebhookSecret,
} from "../_shared/common.ts";

type DeliveryAttempt = {
  id: string;
  push_token_id: string | null;
  expo_ticket_id: string;
  receipt_attempts: number;
};

type ExpoReceipt = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

const MAX_RECEIPT_ATTEMPTS = 5;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    requireWebhookSecret(req);
    const supabase = getAdminClient();
    const now = new Date();

    const { data, error } = await supabase
      .from("notifications")
      .select("id, push_token_id, expo_ticket_id, receipt_attempts")
      .eq("receipt_status", "pending")
      .lte("next_receipt_check_at", now.toISOString())
      .lt("receipt_attempts", MAX_RECEIPT_ATTEMPTS)
      .order("next_receipt_check_at", { ascending: true })
      .limit(1000);

    if (error) throw error;

    const attempts = (data ?? []) as DeliveryAttempt[];
    if (attempts.length === 0) {
      return jsonResponse({ success: true, processed: 0 });
    }

    const ticketIds = [...new Set(attempts.map((attempt) => attempt.expo_ticket_id))];
    const expoResponse = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: ticketIds }),
    });

    if (!expoResponse.ok) {
      throw new Error(`Expo receipt request failed with HTTP ${expoResponse.status}`);
    }

    const result = (await expoResponse.json()) as {
      data?: Record<string, ExpoReceipt>;
    };
    const receipts = result.data ?? {};
    let delivered = 0;
    let rejected = 0;
    let pending = 0;
    let disabledTokens = 0;

    for (const attempt of attempts) {
      const receipt = receipts[attempt.expo_ticket_id];
      const nextAttemptCount = attempt.receipt_attempts + 1;

      if (!receipt) {
        const exhausted = nextAttemptCount >= MAX_RECEIPT_ATTEMPTS;
        const { error: updateError } = await supabase
          .from("notifications")
          .update({
            receipt_status: exhausted ? "missing" : "pending",
            receipt_error: exhausted ? "MissingReceipt" : null,
            receipt_attempts: nextAttemptCount,
            receipt_checked_at: now.toISOString(),
            next_receipt_check_at: exhausted
              ? null
              : new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
          })
          .eq("id", attempt.id);

        if (updateError) throw updateError;
        pending += 1;
        continue;
      }

      const receiptError = receipt.details?.error ?? null;
        const { error: updateError } = await supabase
        .from("notifications")
        .update({
          receipt_status: receipt.status,
          receipt_error: receiptError,
          receipt_message: receipt.message ?? null,
          receipt_attempts: nextAttemptCount,
          receipt_checked_at: now.toISOString(),
          next_receipt_check_at: null,
        })
        .eq("id", attempt.id);

      if (updateError) throw updateError;

      if (receipt.status === "ok") {
        delivered += 1;
      } else {
        rejected += 1;
      }

      if (receiptError === "DeviceNotRegistered" && attempt.push_token_id) {
        const { error: disableError } = await supabase
          .from("push_tokens")
          .update({
            enabled: false,
            disabled_reason: "device_not_registered",
            updated_at: now.toISOString(),
          })
          .eq("id", attempt.push_token_id);

        if (disableError) throw disableError;
        disabledTokens += 1;
      }
    }

    console.info("Push receipts processed", {
      processed: attempts.length,
      delivered,
      rejected,
      pending,
      disabledTokens,
    });

    return jsonResponse({
      success: true,
      processed: attempts.length,
      delivered,
      rejected,
      pending,
      disabledTokens,
    });
  } catch (error) {
    const message = errorMessage(error);
    console.error("process-push-receipts failed", { error: message });
    return jsonResponse(
      { error: message },
      message === "Unauthorized webhook request" ? 401 : 500,
    );
  }
});
