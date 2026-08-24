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

type MessageRecord = {
  id: string;
  chat_id: string | null;
  sender_id: string | null;
  message: string | null;
  type: string | null;
  image: string | null;
};

type ConversationMemberRecord = {
  id: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      String((error as { code?: unknown }).code) === "23505",
  );
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    requireWebhookSecret(req);

    const payload = (await req.json()) as WebhookPayload<MessageRecord>;
    const message = payload.record;

    if (
      payload.type !== "INSERT" ||
      payload.table !== "messages" ||
      payload.schema !== "public" ||
      !message?.id ||
      !message.chat_id ||
      !message.sender_id
    ) {
      console.info("Message notification skipped", {
        reason: "Invalid webhook payload",
        eventType: payload.type,
        table: payload.table,
        schema: payload.schema,
        messageId: message?.id ?? null,
      });
      return jsonResponse({ skipped: true, reason: "Invalid webhook payload" });
    }

    console.info("Processing new message", {
      messageId: message.id,
      chatId: message.chat_id,
      senderId: message.sender_id,
    });

    const supabase = getAdminClient();
    const [membersResult, chatResult] = await Promise.all([
      supabase
        .from("conversation_members")
        .select("id")
        .eq("chat_id", message.chat_id),
      supabase
        .from("chat")
        .select("type")
        .eq("id", message.chat_id)
        .maybeSingle(),
    ]);
    const { data: members, error: membersError } = membersResult;

    if (membersError) {
      console.error("Could not load conversation members", {
        messageId: message.id,
        chatId: message.chat_id,
        senderId: message.sender_id,
        error: membersError.message,
        code: membersError.code,
      });
      throw membersError;
    }

    if (chatResult.error) {
      console.warn("Could not load notification chat type", {
        messageId: message.id,
        chatId: message.chat_id,
        code: chatResult.error.code,
      });
    }

    const memberRows = (members ?? []) as ConversationMemberRecord[];
    const recipientUserIds = memberRows
      .map((member) => member.id)
      .filter((userId) => userId !== message.sender_id);

    console.info("Conversation members resolved", {
      messageId: message.id,
      chatId: message.chat_id,
      senderId: message.sender_id,
      memberCount: memberRows.length,
      recipientUserIds,
    });

    if (recipientUserIds.length === 0) {
      console.info("Message notification skipped", {
        messageId: message.id,
        chatId: message.chat_id,
        senderId: message.sender_id,
        reason: "No recipients in conversation",
      });
      return jsonResponse({
        success: true,
        recipientCount: 0,
        notificationCount: 0,
        pushAttemptCount: 0,
        reason: "No recipients",
      });
    }

    const { data: sender, error: senderError } = await supabase
      .from("users")
      .select("name")
      .eq("id", message.sender_id)
      .maybeSingle();

    if (senderError) {
      console.error("Could not load message sender", {
        messageId: message.id,
        senderId: message.sender_id,
        error: senderError.message,
        code: senderError.code,
      });
      throw senderError;
    }

    const senderName = sender?.name?.trim() || "Someone";
    const preview = message.message?.trim()
      ? message.message.trim().slice(0, 140)
      : message.image
        ? "Sent an image"
        : "Sent a message";
    // DB uniqueness key only. Clients must not navigate from this string.
    const destination = `new_message:${message.id}`;
    const chatKind = chatResult.data?.type === "group" ? "group" : "private";
    const title = senderName;
    const body = preview;
    const data = {
      type: "new_message",
      chatId: message.chat_id,
      chatKind,
      messageId: message.id,
      senderId: message.sender_id,
    };
    const ctaUrl =
      `https://sportiner.com/open/message` +
      `?chatId=${encodeURIComponent(message.chat_id)}` +
      `&messageId=${encodeURIComponent(message.id)}`;

    const results = await Promise.allSettled(
      recipientUserIds.map(async (recipientUserId) => {
        const { data: preference, error: preferenceError } = await supabase
          .from("notification_preferences")
          .select("chat_messages")
          .eq("user_id", recipientUserId)
          .maybeSingle();

        if (preferenceError) {
          console.warn("Could not load chat notification preference", {
            messageId: message.id,
            recipientUserId,
            code: preferenceError.code,
          });
        }

        const pushEnabled = preference?.chat_messages ?? true;
        const pushToken = pushEnabled
          ? await findPushToken(supabase, recipientUserId)
          : null;
        const { data: notification, error: notificationError } = await supabase
          .from("notifications")
          .insert({
            user_id: recipientUserId,
            type: "new_message",
            content: `${senderName}: ${preview}`,
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
            console.info("Message notification skipped", {
              messageId: message.id,
              recipientUserId,
              reason: "Duplicate webhook delivery",
            });
            return {
              notificationId: null,
              pushSent: false,
              pushAttemptCount: 0,
            };
          }
          throw notificationError ?? new Error("Could not create notification");
        }

        const emailSubject = `New message from ${senderName}`;
        const emailMessage =
          `${senderName} sent you a new message. Open Sportiner to read it and reply.`;

        if (!pushEnabled) {
          EdgeRuntime.waitUntil(
            sendEmailFallback(
              supabase,
              recipientUserId,
              emailSubject,
              "New message on Sportiner",
              emailMessage,
              ctaUrl,
              "View Message",
            ),
          );

          return {
            notificationId: notification.id,
            pushSent: false,
            pushAttemptCount: 0,
          };
        }

        if (!pushToken) {
          await sendEmailFallback(
            supabase,
            recipientUserId,
            emailSubject,
            "New message on Sportiner",
            emailMessage,
            ctaUrl,
            "View Message",
          );

          return {
            notificationId: notification.id,
            pushSent: false,
            pushAttemptCount: 0,
          };
        }

        const pushAccepted = await sendPushNotification(
          supabase,
          pushToken,
          title,
          body,
          notification.id,
          data,
          "sportiner-message.wav",
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
            console.warn("Could not mark message push as sent", {
              messageId: message.id,
              recipientUserId,
              code: pushUpdateError.code,
            });
          }
        }

        EdgeRuntime.waitUntil(
          checkDeliveryAndRetry(supabase, {
            notificationId: notification.id,
            initialPushAccepted: pushAccepted,
            receiverId: recipientUserId,
            pushToken,
            title,
            body,
            data,
            emailSubject,
            emailHeading: "New message on Sportiner",
            emailMessage,
            ctaUrl,
            sound: "sportiner-message.wav",
            ctaLabel: "View Message",
          }),
        );

        return {
          notificationId: notification.id,
          pushSent: pushAccepted,
          pushAttemptCount: 1,
        };
      }),
    );

    let notificationCount = 0;
    let pushAttemptCount = 0;
    let pushSentCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        if (!result.value.notificationId) {
          duplicateCount += 1;
          return;
        }
        notificationCount += 1;
        pushAttemptCount += result.value.pushAttemptCount;
        if (result.value.pushSent) pushSentCount += 1;
        return;
      }

      failedCount += 1;
      console.error("Recipient notification failed", {
        messageId: message.id,
        chatId: message.chat_id,
        recipientUserId: recipientUserIds[index],
        error: errorMessage(result.reason),
      });
    });

    console.info("New message notification completed", {
      messageId: message.id,
      chatId: message.chat_id,
      senderId: message.sender_id,
      recipientCount: recipientUserIds.length,
      notificationCount,
      pushAttemptCount,
      pushSentCount,
      duplicateCount,
      failedCount,
    });

    return jsonResponse(
      {
        success: failedCount === 0,
        recipientCount: recipientUserIds.length,
        notificationCount,
        pushAttemptCount,
        pushSentCount,
        duplicateCount,
        failedCount,
      },
      failedCount === recipientUserIds.length ? 500 : 200,
    );
  } catch (error) {
    const message = errorMessage(error);
    console.error("notify-new-message failed", { error: message });
    return jsonResponse(
      { error: message },
      message === "Unauthorized webhook request" ? 401 : 500,
    );
  }
});
