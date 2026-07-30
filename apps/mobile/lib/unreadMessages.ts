export type ConversationReadCursor = {
  chat_id: string;
  last_read_at: string | null;
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
