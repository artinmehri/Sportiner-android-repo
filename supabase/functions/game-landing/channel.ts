export type GameLinkChannelCode = "r" | "f" | "l" | "e" | "i" | "lin" | "w";

export type GameLinkChannel =
  | "reddit"
  | "facebook"
  | "luma"
  | "eventbrite"
  | "instagram"
  | "linkedin"
  | "whatsapp";

export type ParsedGameLinkChannel = {
  code: GameLinkChannelCode;
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

/** Parse a manually tagged `ch=` game-link channel code. */
export function parseGameLinkChannel(
  value: string | null | undefined,
): ParsedGameLinkChannel | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  if (!(normalized in CHANNEL_BY_CODE)) return null;
  const code = normalized as GameLinkChannelCode;
  return { code, channel: CHANNEL_BY_CODE[code] };
}
