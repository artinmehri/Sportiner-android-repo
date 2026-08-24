import { describe, expect, it } from 'vitest';
import { countUnreadMessages, isConversationUnread } from './unreadMessages';

describe('countUnreadMessages', () => {
  it('counts only messages newer than the matching chat read cursor', () => {
    expect(
      countUnreadMessages(
        [
          { chat_id: 'chat-a', last_read_at: '2026-07-30T10:00:00.000Z' },
          { chat_id: 'chat-b', last_read_at: null },
        ],
        [
          { chat_id: 'chat-a', created_at: '2026-07-30T09:00:00.000Z' },
          { chat_id: 'chat-a', created_at: '2026-07-30T11:00:00.000Z' },
          { chat_id: 'chat-b', created_at: '2026-07-30T09:00:00.000Z' },
        ],
      ),
    ).toBe(2);
  });
});

describe('isConversationUnread', () => {
  const base = {
    currentUserId: 'me',
    lastMessageId: 'msg-2',
    lastMessageAt: '2026-08-10T12:00:00.000Z',
    lastMessageSenderId: 'them',
    lastReadMessageId: 'msg-1',
    lastReadAt: '2026-08-10T11:00:00.000Z',
  };

  it('marks someone else’s unread last message as unread', () => {
    expect(isConversationUnread(base)).toBe(true);
  });

  it('never marks your own last message as unread', () => {
    expect(
      isConversationUnread({
        ...base,
        lastMessageSenderId: 'me',
        lastReadMessageId: null,
        lastReadAt: null,
      }),
    ).toBe(false);
  });

  it('clears unread once last_read_message_id matches', () => {
    expect(
      isConversationUnread({
        ...base,
        lastReadMessageId: 'msg-2',
      }),
    ).toBe(false);
  });

  it('clears unread once last_read_at catches the last message', () => {
    expect(
      isConversationUnread({
        ...base,
        lastReadMessageId: null,
        lastReadAt: '2026-08-10T12:00:00.000Z',
      }),
    ).toBe(false);
  });
});
