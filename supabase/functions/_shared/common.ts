import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type WebhookPayload<T> = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: T;
  old_record: T | null;
};

export type NotificationInput = {
  userId: string;
  type: string;
  content: string;
  destination: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type PushTokenRow = {
  id: string;
  expo_push_token: string;
};

export function getAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function requireWebhookSecret(req: Request): void {
  const expected = Deno.env.get("WEBHOOK_SECRET");
  const received = req.headers.get("x-webhook-secret");

  if (!expected) throw new Error("WEBHOOK_SECRET is not configured");
  if (received !== expected) throw new Error("Unauthorized webhook request");
}

export function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isExpoPushToken(token: string): boolean {
  return /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

export async function createAndSendNotification(
  supabase: SupabaseClient,
  input: NotificationInput,
): Promise<{
  notificationId: string;
  pushSent: boolean;
  pushAttemptCount: number;
}> {
  const { data: notification, error: notificationError } = await supabase
    .from("notifications")
    .insert({
      user_id: input.userId,
      type: input.type,
      content: input.content,
      destination: input.destination,
      read: false,
      push_sent: false,
    })
    .select("id")
    .single();

  if (notificationError) {
    const error = new Error(
      `Could not create notification for ${input.userId}: ${notificationError.message}`,
    ) as Error & { code?: string };
    error.code = notificationError.code;
    throw error;
  }

  const { data: tokenRows, error: tokenError } = await supabase
    .from("push_tokens")
    .select("id, expo_push_token")
    .eq("user_id", input.userId)
    .eq("enabled", true);

  if (tokenError) {
    console.error("Could not load push tokens", {
      notificationId: notification.id,
      recipientUserId: input.userId,
      error: tokenError.message,
      code: tokenError.code,
    });
    return {
      notificationId: notification.id,
      pushSent: false,
      pushAttemptCount: 0,
    };
  }

  const enabledTokenRows = (tokenRows ?? []) as PushTokenRow[];
  const validTokenRows = enabledTokenRows.filter((tokenRow) => {
    const valid = isExpoPushToken(tokenRow.expo_push_token);
    if (!valid) {
      console.warn("Skipping invalid Expo push token", {
        notificationId: notification.id,
        recipientUserId: input.userId,
        tokenId: tokenRow.id,
      });
    }
    return valid;
  });

  if (validTokenRows.length === 0) {
    return {
      notificationId: notification.id,
      pushSent: false,
      pushAttemptCount: 0,
    };
  }

  let successfulTickets = 0;
  let pushAttemptCount = 0;

  for (const tokenBatch of chunk(validTokenRows, 100)) {
    const messages = tokenBatch.map((tokenRow) => ({
      to: tokenRow.expo_push_token,
      sound: "default",
      channelId: "default",
      priority: "high",
      title: input.title,
      body: input.body,
      data: {
        ...input.data,
        type: input.type,
      },
    }));

    pushAttemptCount += messages.length;

    try {
      const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!expoResponse.ok) {
        console.error("Expo push request failed", {
          notificationId: notification.id,
          recipientUserId: input.userId,
          status: expoResponse.status,
          tokenCount: tokenBatch.length,
        });
        continue;
      }

      const result = (await expoResponse.json()) as { data?: ExpoTicket[] };
      const tickets = result.data ?? [];

      for (let i = 0; i < tokenBatch.length; i += 1) {
        const ticket = tickets[i];
        const tokenRow = tokenBatch[i];

        if (ticket?.status === "ok") {
          successfulTickets += 1;
          continue;
        }

        if (ticket?.details?.error === "DeviceNotRegistered") {
          const { error: disableError } = await supabase
            .from("push_tokens")
            .update({
              enabled: false,
              disabled_reason: "device_not_registered",
              updated_at: new Date().toISOString(),
            })
            .eq("id", tokenRow.id);

          if (disableError) {
            console.error("Could not disable unregistered push token", {
              notificationId: notification.id,
              recipientUserId: input.userId,
              tokenId: tokenRow.id,
              error: disableError.message,
              code: disableError.code,
            });
          }
        }

        console.error("Expo rejected push", {
          notificationId: notification.id,
          recipientUserId: input.userId,
          tokenId: tokenRow.id,
          error: ticket?.details?.error ?? "MissingTicket",
        });
      }
    } catch (error) {
      console.error("Expo push request failed", {
        notificationId: notification.id,
        recipientUserId: input.userId,
        tokenCount: tokenBatch.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const pushSent = successfulTickets > 0;

  if (pushSent) {
    const { error: updateError } = await supabase
      .from("notifications")
      .update({
        push_sent: true,
        pushed_at: new Date().toISOString(),
      })
      .eq("id", notification.id);

    if (updateError) {
      console.error("Could not mark notification as pushed", {
        notificationId: notification.id,
        recipientUserId: input.userId,
        error: updateError.message,
        code: updateError.code,
      });
      return {
        notificationId: notification.id,
        pushSent: false,
        pushAttemptCount,
      };
    }
  }

  return {
    notificationId: notification.id,
    pushSent,
    pushAttemptCount,
  };
}

export function startOfTorontoToday(): string {
  const timeZone = "America/Toronto";
  const now = new Date();
  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as { year: number; month: number; day: number };
  const utcGuess = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0),
  );
  const zonedParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(utcGuess)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
  const representedAsUtc = Date.UTC(
    zonedParts.year,
    zonedParts.month - 1,
    zonedParts.day,
    zonedParts.hour,
    zonedParts.minute,
    zonedParts.second,
  );
  const offsetMs = representedAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs).toISOString();
}
