import { describe, expect, it } from 'vitest';

import {
  isUgcTextRejectedError,
  UGC_TEXT_REJECTED_COPY,
} from './ugcModeration';

describe('UGC moderation errors', () => {
  it('recognizes only the server moderation rejection marker', () => {
    expect(
      isUgcTextRejectedError({ code: 'P0001', message: 'ugc_text_rejected' }),
    ).toBe(true);
    expect(isUgcTextRejectedError(new Error('ugc_text_rejected'))).toBe(true);
    expect(isUgcTextRejectedError({ code: 'P0001', message: 'other_error' })).toBe(
      false,
    );
  });

  it('provides understandable retry guidance', () => {
    expect(UGC_TEXT_REJECTED_COPY.title).toBe('Content not allowed');
    expect(UGC_TEXT_REJECTED_COPY.message).toContain('Please edit it and try again.');
  });
});
