import { describe, expect, it } from 'vitest';
import { countUnreadMessages } from '../lib/unreadMessages';

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
