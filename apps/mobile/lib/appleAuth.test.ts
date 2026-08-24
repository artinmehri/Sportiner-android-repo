import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPLE_REAUTH_REQUIRED,
  runAppleAwareDelete,
  storeAppleAuthorizationCode,
} from './appleAuth';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('expo-apple-authentication', () => ({ signInAsync: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({
  supabase: {
    functions: { invoke },
  },
}));

beforeEach(() => invoke.mockReset());

describe('storeAppleAuthorizationCode', () => {
  it('sends the one-time code only to the authenticated backend function', async () => {
    invoke.mockResolvedValue({ data: { stored: true }, error: null });

    await storeAppleAuthorizationCode('single-use-code');

    expect(invoke).toHaveBeenCalledWith('apple-token-exchange', {
      body: { authorizationCode: 'single-use-code' },
    });
  });

  it('rejects missing codes before calling the backend', async () => {
    await expect(storeAppleAuthorizationCode(null)).rejects.toThrow('authorization code');
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('runAppleAwareDelete', () => {
  it('reauthenticates once and retries when a legacy Apple account needs a credential', async () => {
    const context = new Response(JSON.stringify({ code: APPLE_REAUTH_REQUIRED }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
    const invokeDelete = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { context } })
      .mockResolvedValueOnce({ data: { message: 'Account deleted successfully' }, error: null });
    const reauthenticate = vi.fn().mockResolvedValue(undefined);

    const result = await runAppleAwareDelete(invokeDelete, reauthenticate);

    expect(reauthenticate).toHaveBeenCalledOnce();
    expect(invokeDelete).toHaveBeenCalledTimes(2);
    expect(result.error).toBeNull();
  });

  it('leaves the account untouched when Apple reauthentication is cancelled', async () => {
    const invokeDelete = vi.fn().mockResolvedValue({
      data: { code: APPLE_REAUTH_REQUIRED },
      error: {},
    });
    const reauthenticate = vi.fn().mockRejectedValue(new Error('cancelled'));

    await expect(runAppleAwareDelete(invokeDelete, reauthenticate)).rejects.toThrow('cancelled');
    expect(invokeDelete).toHaveBeenCalledOnce();
  });

  it('does not reauthenticate for non-Apple deletion failures', async () => {
    const failure = { data: null, error: new Error('offline') };
    const invokeDelete = vi.fn().mockResolvedValue(failure);
    const reauthenticate = vi.fn();

    await expect(runAppleAwareDelete(invokeDelete, reauthenticate)).resolves.toBe(failure);
    expect(reauthenticate).not.toHaveBeenCalled();
    expect(invokeDelete).toHaveBeenCalledOnce();
  });
});
