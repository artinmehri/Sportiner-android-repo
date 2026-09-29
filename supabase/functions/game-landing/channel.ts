export type GameLinkChannelCode = "r" | "f" | "l" | "e" | "i" | "lin" | "w";

export type GameLinkChannel =
  | "reddit"
  | "facebook"
  | "luma"
  | "eventbrite"
  | "instagram"
  | "linkedin"
  | "whatsapp"
  /** Organic open from inside the app. Stamped by product-event from platform, never from `ch=`. */
  | "app"
  /** A `ch=` tag was present but is not one we publish. */
  | "unknown";

export type ParsedGameLinkChannel = {
  /** Null for `unknown` — there is no code to echo back into a canonical URL. */
  code: GameLinkChannelCode | null;
  channel: GameLinkChannel;
  /** Sanitized tag text for `unknown`; null for known channels or when nothing safe is left. */
  tag: string | null;
};

const CHANNEL_BY_CODE: Record<GameLinkChannelCode, GameLinkChannel> = {
  r: "reddit",
  f: "facebook",
  l: "luma",
  e: "eventbrite",
  i: "instagram",
  lin: "linkedin",
  w: "whatsapp",
};

/** Own keys only: `in` would also accept inherited names like "constructor". */
function isChannelCode(value: string): value is GameLinkChannelCode {
  return Object.hasOwn(CHANNEL_BY_CODE, value);
}

export const UNKNOWN_TAG_MAX = 64;

/**
 * An unrecognised tag is visitor-typed and gets echoed into links and the page
 * script, so it is reduced to lowercase letters, digits, dash and underscore,
 * at most UNKNOWN_TAG_MAX characters.
 */
export function sanitizeUnknownTag(value: string): string | null {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, UNKNOWN_TAG_MAX);
  return cleaned || null;
}

/**
 * Sent back by the page when the tag was unrecognised but nothing safe survived
 * sanitizing. Outside the safe alphabet, so it re-parses as `unknown` with no tag.
 */
export const UNKNOWN_WITHOUT_TAG = "?";

/**
 * Parse a manually tagged `ch=` game-link channel code.
 * An absent tag stays null so untagged links are unchanged; a tag we do not
 * recognise resolves to `unknown` rather than disappearing.
 */
export function parseGameLinkChannel(
  value: string | null | undefined,
): ParsedGameLinkChannel | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  if (!isChannelCode(normalized)) {
    const tag = sanitizeUnknownTag(normalized);
    // "r!" cleans to "r": keeping it would make the tag re-parse as reddit.
    return {
      code: null,
      channel: "unknown",
      tag: tag && !isChannelCode(tag) ? tag : null,
    };
  }
  return { code: normalized, channel: CHANNEL_BY_CODE[normalized], tag: null };
}

/** The `ch=` value to put in a shareable URL: the code, or the sanitized unknown tag. */
export function linkChannelTag(channel: ParsedGameLinkChannel | null): string | null {
  return channel?.code ?? channel?.tag ?? null;
}

/**
 * The `ch` the landing page's script sends back on /context and /install, so
 * those events carry the same channel as the server-rendered view. Always
 * non-empty when a tag was present, so `unknown` never silently becomes no tag.
 */
export function browserChannelTag(channel: ParsedGameLinkChannel | null): string | null {
  if (!channel) return null;
  return linkChannelTag(channel) ?? UNKNOWN_WITHOUT_TAG;
}
