export type ConversationReadCursor = {
  chat_id: string;
  last_read_at: string | null;
};

export type ConversationUnreadInput = {
  currentUserId: string;
  lastMessageId: string | null | undefined;
  lastMessageAt: string | null | undefined;
  lastMessageSenderId: string | null | undefined;
  lastReadMessageId: string | null | undefined;
  lastReadAt: string | null | undefined;
};

export function countUnreadMessages(
  memberships: ConversationReadCursor[],
  messages: Array<{ chat_id: string | null; created_at: string | null }>,
): number {
  const readAtByChat = new Map(
    memberships.map((membership) => [membership.chat_id, membership.last_read_at]),
  );

  return messages.reduce((count, message) => {
    if (!message.chat_id || !message.created_at) return count;
    const lastReadAt = readAtByChat.get(message.chat_id);
    return !lastReadAt || message.created_at > lastReadAt ? count + 1 : count;
  }, 0);
}

/**
 * Inbox row unread: true only when the latest message is from someone else
 * and this user's read cursor has not caught up to it.
 */
export function isConversationUnread(input: ConversationUnreadInput): boolean {
  const {
    currentUserId,
    lastMessageId,
    lastMessageAt,
    lastMessageSenderId,
    lastReadMessageId,
    lastReadAt,
  } = input;

  if (!lastMessageId || !currentUserId) {
    return false;
  }

  // Outbound last message is never unread for the sender.
  if (lastMessageSenderId === currentUserId) {
    return false;
  }

  if (lastReadMessageId === lastMessageId) {
    return false;
  }

  if (lastReadAt && lastMessageAt && lastMessageAt <= lastReadAt) {
    return false;
  }

  return true;
}
