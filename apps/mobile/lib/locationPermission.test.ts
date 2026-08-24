import { describe, expect, it, vi } from 'vitest';

import { resolveForegroundLocationPermission } from './locationPermission';

describe('resolveForegroundLocationPermission', () => {
  it('requests the iOS foreground prompt when permission is undetermined', async () => {
    const getPermission = vi.fn().mockResolvedValue({ status: 'undetermined' });
    const requestPermission = vi.fn().mockResolvedValue({ status: 'granted' });

    await expect(
      resolveForegroundLocationPermission(getPermission, requestPermission),
    ).resolves.toEqual({ status: 'granted' });
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('does not prompt again after location was denied', async () => {
    const getPermission = vi.fn().mockResolvedValue({ status: 'denied' });
    const requestPermission = vi.fn();

    await expect(
      resolveForegroundLocationPermission(getPermission, requestPermission),
    ).resolves.toEqual({ status: 'denied' });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('does not prompt again after location was granted', async () => {
    const getPermission = vi.fn().mockResolvedValue({ status: 'granted' });
    const requestPermission = vi.fn();

    await expect(
      resolveForegroundLocationPermission(getPermission, requestPermission),
    ).resolves.toEqual({ status: 'granted' });
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
