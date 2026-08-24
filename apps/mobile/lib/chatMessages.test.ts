import { describe, expect, it } from 'vitest';

import {
  mergeMessagesById,
  removeMessageById,
  upsertChatMessages,
} from './chatMessages';

describe('mergeMessagesById', () => {
  it('keeps one row per id and lets the later copy win', () => {
    expect(
      mergeMessagesById(
        [
          { id: 'a', created_at: '2026-08-20T10:00:00.000Z', message: 'old' },
          { id: 'b', created_at: '2026-08-20T10:01:00.000Z', message: 'b' },
        ],
        [{ id: 'a', created_at: '2026-08-20T10:00:00.000Z', message: 'edited', is_edited: true }],
      ),
    ).toEqual([
      { id: 'a', created_at: '2026-08-20T10:00:00.000Z', message: 'edited', is_edited: true },
      { id: 'b', created_at: '2026-08-20T10:01:00.000Z', message: 'b' },
    ]);
  });

  it('sorts by created_at so sent and received stay in order', () => {
    expect(
      mergeMessagesById(
        [{ id: 'newer', created_at: '2026-08-20T10:02:00.000Z' }],
        [{ id: 'older', created_at: '2026-08-20T10:01:00.000Z' }],
      ).map((message) => message.id),
    ).toEqual(['older', 'newer']);
  });
});

describe('upsertChatMessages', () => {
  const store = {
    'chat-a': [{ id: 'a1', chat_id: 'chat-a', sender_id: 'u1', message: 'hi', type: 'text' }],
  };

  it('leaves other conversations untouched when a message arrives', () => {
    const next = upsertChatMessages(store, 'chat-b', [
      { id: 'b1', chat_id: 'chat-b', sender_id: 'u2', message: 'other thread', type: 'text' },
    ]);

    expect(next['chat-a']).toEqual(store['chat-a']);
    expect(next['chat-b'].map((message) => message.id)).toEqual(['b1']);
  });

  it('refuses a row whose chat_id belongs to a different conversation', () => {
    const next = upsertChatMessages(store, 'chat-a', [
      { id: 'b1', chat_id: 'chat-b', sender_id: 'u2', message: 'leaked', type: 'text' },
    ]);

    expect(next['chat-a'].map((message) => message.id)).toEqual(['a1']);
  });
});

describe('removeMessageById', () => {
  it('drops the deleted message and leaves replies in place', () => {
    const remaining = removeMessageById(
      [
        { id: 'keep', message: 'still here' },
        { id: 'gone', message: 'delete me' },
        { id: 'reply', reply_to: 'gone' },
      ],
      'gone',
    );

    expect(remaining.map((message) => message.id)).toEqual(['keep', 'reply']);
  });
});
