import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitGameLinkOpenedEvent, emitGameViewedEvent } from './productEvent';

const { getItem, setItem, getSession, invoke, randomUUID } = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
  randomUUID: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem, setItem },
}));

vi.mock('expo-crypto', () => ({ randomUUID }));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession },
    functions: { invoke },
  },
}));

describe('product event identity', () => {
  beforeEach(() => {
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
    getSession.mockResolvedValue({ data: { session: null } });
    invoke.mockResolvedValue({ error: null });
    randomUUID.mockReset();
    randomUUID.mockReturnValueOnce('anonymous-1').mockReturnValue('event-next');
  });

  it('persists one anonymous ID across game view and link events', async () => {
    await emitGameViewedEvent({ gamePublicId: '4a18af4b9c6cb2fbe9464ae11bb11937' });
    await emitGameLinkOpenedEvent({
      gamePublicId: '4a18af4b9c6cb2fbe9464ae11bb11937',
      channel: null,
      shareCodePresent: false,
      resolutionState: 'available',
    });

    expect(getItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith('@sportiner/analytics/anonymous_id', 'anonymous-1');
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0][1].body.anonymous_id).toBe('anonymous-1');
    expect(invoke.mock.calls[1][1].body.anonymous_id).toBe('anonymous-1');
  });
});
