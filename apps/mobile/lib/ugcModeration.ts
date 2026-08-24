export const UGC_TEXT_REJECTED_COPY = {
  title: 'Content not allowed',
  message:
    "This content may violate Sportiner's Community Guidelines. Please edit it and try again.",
} as const;

export function isUgcTextRejectedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const value = error as { code?: unknown; message?: unknown };
  return (
    value.message === 'ugc_text_rejected' &&
    (value.code === undefined || value.code === 'P0001')
  );
}
