import { describe, expect, it } from 'vitest';

import { getCreateGameFormError, type CreateGameFormValues } from './createGameForm';

const valid1v1: CreateGameFormValues = {
  level: 'Beginner',
  date: '2026-08-20T12:00:00.000Z',
  time: '15:00',
  locationName: 'Cedarvale Park',
  hasKnownLocation: true,
  type: '1v1',
  title: '',
  description: 'Looking for a hit.',
  isPaid: false,
  paymentAmount: 0,
};

describe('getCreateGameFormError', () => {
  it('accepts a complete 1v1 form without a title', () => {
    expect(getCreateGameFormError(valid1v1)).toBeNull();
  });

  it('accepts a complete group form', () => {
    expect(
      getCreateGameFormError({
        ...valid1v1,
        type: 'Group',
        title: 'Saturday doubles',
      }),
    ).toBeNull();
  });

  it('reports the first missing required field in screen order', () => {
    expect(getCreateGameFormError({ ...valid1v1, level: '' })).toEqual({
      field: 'level',
      message: 'Please select a level',
    });
    expect(getCreateGameFormError({ ...valid1v1, date: '' })?.field).toBe('date');
    expect(getCreateGameFormError({ ...valid1v1, time: '' })?.field).toBe('time');
    expect(getCreateGameFormError({ ...valid1v1, locationName: '  ' })?.field).toBe(
      'location',
    );
    expect(getCreateGameFormError({ ...valid1v1, description: '' })?.field).toBe(
      'description',
    );
  });

  it('points at level before later missing fields', () => {
    expect(
      getCreateGameFormError({
        ...valid1v1,
        level: '',
        date: '',
        description: '',
      }),
    ).toEqual({
      field: 'level',
      message: 'Please select a level',
    });
  });

  it('rejects whitespace-only descriptions', () => {
    const error = getCreateGameFormError({ ...valid1v1, description: '   ' });
    expect(error?.field).toBe('description');
    expect(error?.message).toBe('Please enter a description');
  });

  it('requires a known location, not just typed text', () => {
    const error = getCreateGameFormError({
      ...valid1v1,
      locationName: 'Some random court',
      hasKnownLocation: false,
    });
    expect(error?.field).toBe('location');
    expect(error?.message).toBe('Please select a location from the list');
  });

  it('requires a title only for group games', () => {
    expect(getCreateGameFormError({ ...valid1v1, title: '' })).toBeNull();
    expect(
      getCreateGameFormError({
        ...valid1v1,
        type: 'Group',
        title: '  ',
      }),
    ).toEqual({
      field: 'title',
      message: 'Please enter a title',
    });
  });

  it('requires a payment amount when splitting court cost', () => {
    expect(
      getCreateGameFormError({
        ...valid1v1,
        isPaid: true,
        paymentAmount: 0,
      }),
    ).toEqual({
      field: 'payment',
      message: 'Please enter an amount per player',
    });
    expect(
      getCreateGameFormError({
        ...valid1v1,
        isPaid: true,
        paymentAmount: 10,
      }),
    ).toBeNull();
  });
});
