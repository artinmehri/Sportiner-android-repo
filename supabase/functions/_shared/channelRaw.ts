/**
 * The raw text of an unrecognised `?ch=` tag, kept alongside channel_hint =
 * 'unknown' so we can see which untracked tags people use. It is visitor-typed,
 * so it is reduced to a small safe alphabet before it goes anywhere: lowercase
 * letters, digits, dash and underscore, at most CHANNEL_RAW_MAX characters
 * (matching the channel_raw column's check constraint).
 */
export const CHANNEL_RAW_MAX = 64;

export function sanitizeChannelRaw(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, CHANNEL_RAW_MAX);
  return cleaned || null;
}
