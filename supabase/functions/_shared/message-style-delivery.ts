import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type PushToken = {
  id: string;
  expo_push_token: string;
};

export type DeliveryInput = {
  notificationId: string;
  initialPushAccepted: boolean;
  receiverId: string;
  pushToken: PushToken;
  title: string;
  body: string;
  data: Record<string, unknown>;
  emailSubject: string;
  emailHeading: string;
  emailMessage: string;
  ctaUrl: string;
  sound?: string;
  ctaLabel?: string;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

async function disablePushToken(
  supabase: SupabaseClient,
  tokenId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from("push_tokens")
    .update({
      enabled: false,
      disabled_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tokenId);

  if (error) console.log("Failed to disable push token:", error);
}

export async function findPushToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<PushToken | null> {
  const { data, error } = await supabase
    .from("push_tokens")
    .select("id, expo_push_token")
    .eq("user_id", userId)
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.log("Failed to find push token:", error);
    return null;
  }

  return data as PushToken | null;
}

export async function sendEmailFallback(
  supabase: SupabaseClient,
  receiverId: string,
  subject: string,
  heading: string,
  message: string,
  ctaUrl: string,
  ctaLabel = "View Game",
): Promise<boolean> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.log("RESEND_API_KEY is not configured");
    return false;
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("email, name")
    .eq("id", receiverId)
    .maybeSingle();

  if (userError) {
    console.log("Failed to get fallback email recipient:", userError);
    return false;
  }

  if (!user?.email) {
    console.log("Receiver has no email:", receiverId);
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Sportiner <onboarding@sportiner.com>",
        to: [user.email],
        subject,
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family:Arial,sans-serif;background:#fff;color:#333;margin:0">
  <div style="max-width:600px;margin:auto;padding:24px">
    <h2 style="color:#005124">${escapeHtml(heading)}</h2>
    <p>Hello ${escapeHtml(user.name?.trim() || "there")},</p>
    <p>${escapeHtml(message)}</p>
    <div style="text-align:center">
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#19E675;color:#005124;text-decoration:none;padding:14px 24px;border-radius:6px;font-weight:bold;margin-top:24px">${escapeHtml(ctaLabel)}</a>
    </div>
    <p style="font-size:12px;color:#888;text-align:center;margin-top:40px">&copy; 2026 Sportiner. All rights reserved.</p>
  </div>
</body>
</html>`,
      }),
    });

    if (!response.ok) {
      console.log("Failed to send fallback email:", response.status);
      return false;
    }

    console.log("Fallback email sent:", receiverId);
    return true;
  } catch (error) {
    console.log("Failed to send fallback email:", error);
    return false;
  }
}

export async function sendPushNotification(
  supabase: SupabaseClient,
  pushToken: PushToken,
  title: string,
  body: string,
  notificationId: string,
  data: Record<string, unknown>,
  sound = "sportiner-game.wav",
): Promise<boolean> {
  if (
    !/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(
      pushToken.expo_push_token,
    )
  ) {
    console.log("Invalid Expo push token:", pushToken.id);
    await disablePushToken(supabase, pushToken.id, "invalid_format");
    return false;
  }

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: pushToken.expo_push_token,
        sound,
        channelId: "default",
        priority: "high",
        title,
        body,
        data: { ...data, notificationId },
      }),
    });

    const result = await response.json();
    console.log("Expo response:", {
      notificationId,
      pushTokenId: pushToken.id,
      result,
    });

    if (!response.ok || result.data?.status !== "ok") {
      if (result.data?.details?.error === "DeviceNotRegistered") {
        await disablePushToken(supabase, pushToken.id, "device_not_registered");
      }
      console.log("Expo rejected push:", {
        notificationId,
        pushTokenId: pushToken.id,
        result,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.log("Push request failed:", {
      notificationId,
      pushTokenId: pushToken.id,
      error,
    });
    return false;
  }
}

export async function checkDeliveryAndRetry(
  supabase: SupabaseClient,
  input: DeliveryInput,
): Promise<void> {
  try {
    if (input.initialPushAccepted) {
      console.log("Push retry skipped", {
        notificationId: input.notificationId,
        recipientUserId: input.receiverId,
        pushTokenId: input.pushToken.id,
        attempt: 1,
        outcome: "accepted",
      });
      return;
    }

    await wait(5000);

    const { data: notification, error } = await supabase
      .from("notifications")
      .select("delivered_at")
      .eq("id", input.notificationId)
      .single();

    if (error || !notification) {
      console.log("Failed to check delivery:", error);
      return;
    }

    if (notification.delivered_at) {
      console.log("Notification delivered:", input.notificationId);
      return;
    }

    console.log("Initial push failed, retrying", {
      notificationId: input.notificationId,
      recipientUserId: input.receiverId,
      pushTokenId: input.pushToken.id,
      attempt: 2,
    });

    const { error: updateError } = await supabase
      .from("notifications")
      .update({
        attempt_count: 2,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", input.notificationId);

    if (updateError) {
      console.log("Failed to update retry attempt:", updateError);
      return;
    }

    const retryAccepted = await sendPushNotification(
      supabase,
      input.pushToken,
      input.title,
      input.body,
      input.notificationId,
      input.data,
      input.sound,
    );

    if (retryAccepted) {
      await supabase
        .from("notifications")
        .update({
          push_sent: true,
          pushed_at: new Date().toISOString(),
        })
        .eq("id", input.notificationId);

      console.log("Push retry accepted", {
        notificationId: input.notificationId,
        recipientUserId: input.receiverId,
        pushTokenId: input.pushToken.id,
        attempt: 2,
      });
      return;
    }

    await wait(5000);

    const { data: retriedNotification, error: retryError } = await supabase
      .from("notifications")
      .select("delivered_at")
      .eq("id", input.notificationId)
      .single();

    if (retryError || !retriedNotification) {
      console.log("Failed to check retried delivery:", retryError);
      return;
    }

    if (retriedNotification.delivered_at) {
      console.log("Notification delivered after retry:", input.notificationId);
      return;
    }

    await sendEmailFallback(
      supabase,
      input.receiverId,
      input.emailSubject,
      input.emailHeading,
      input.emailMessage,
      input.ctaUrl,
      input.ctaLabel,
    );
  } catch (error) {
    console.log("Delivery retry failed:", error);
  }
}
