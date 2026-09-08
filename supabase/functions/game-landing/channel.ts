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

const UNKNOWN_CHANNEL: ParsedGameLinkChannel = { code: null, channel: "unknown" };

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
  if (!(normalized in CHANNEL_BY_CODE)) return UNKNOWN_CHANNEL;
  const code = normalized as GameLinkChannelCode;
  return { code, channel: CHANNEL_BY_CODE[code] };
}
