import {
  createAndSendNotification,
  getAdminClient,
  jsonResponse,
  requireWebhookSecret,
  WebhookPayload,
} from "../_shared/common.ts";

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
    // DB uniqueness key only — clients must not navigate from this string.
    const destination = `new_message:${message.id}`;
    const chatKind = chatResult.data?.type === "group" ? "group" : "private";

    const results = await Promise.allSettled(
      recipientUserIds.map((recipientUserId) =>
        createAndSendNotification(supabase, {
          userId: recipientUserId,
          type: "new_message",
          content: `${senderName}: ${preview}`,
          destination,
          title: senderName,
          body: preview,
          data: {
            type: "new_message",
            chatId: message.chat_id,
            chatKind,
            messageId: message.id,
            senderId: message.sender_id,
          },
        }),
      ),
    );

    let notificationCount = 0;
    let pushAttemptCount = 0;
    let pushSentCount = 0;
    let failedCount = 0;

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
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
      failedCount,
    });

    return jsonResponse(
      {
        success: failedCount === 0,
        recipientCount: recipientUserIds.length,
        notificationCount,
        pushAttemptCount,
        pushSentCount,
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
