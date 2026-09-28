import { assertEquals } from "jsr:@std/assert@1";
import {
  browserChannelTag,
  linkChannelTag,
  parseGameLinkChannel,
  UNKNOWN_WITHOUT_RAW_TAG,
} from "./channel.ts";

/** What /context and /install see after the page sends its tag back. */
function roundTrip(ch: string | null) {
  return parseGameLinkChannel(browserChannelTag(parseGameLinkChannel(ch)));
}

Deno.test("no tag gives nothing, on the page and on follow-up events", () => {
  for (const ch of [null, undefined, "", "   "]) {
    assertEquals(parseGameLinkChannel(ch), null);
    assertEquals(browserChannelTag(parseGameLinkChannel(ch)), null);
    assertEquals(linkChannelTag(parseGameLinkChannel(ch)), null);
  }
});

Deno.test("known tags round-trip unchanged", () => {
  assertEquals(roundTrip("r"), { code: "r", channel: "reddit", raw: null });
  assertEquals(roundTrip("lin"), { code: "lin", channel: "linkedin", raw: null });
  assertEquals(roundTrip(" W "), { code: "w", channel: "whatsapp", raw: null });
  assertEquals(browserChannelTag(parseGameLinkChannel("r")), "r");
  assertEquals(linkChannelTag(parseGameLinkChannel("r")), "r");
});

// Regression: bug 2a. An unrecognised tag used to reach the browser as null, so
// /context and /install events lost the channel entirely.
Deno.test("unrecognised tag stays unknown on follow-up events, with raw text", () => {
  const first = parseGameLinkChannel("TikTok");
  assertEquals(first, { code: null, channel: "unknown", raw: "tiktok" });
  assertEquals(browserChannelTag(first), "tiktok");
  assertEquals(roundTrip("TikTok"), first);
});

Deno.test("unrecognised tag keeps sanitized raw text across the round trip", () => {
  assertEquals(roundTrip("Tik Tok!"), { code: null, channel: "unknown", raw: "tiktok" });
  assertEquals(roundTrip("spring_2026-promo"), {
    code: null,
    channel: "unknown",
    raw: "spring_2026-promo",
  });
});

Deno.test("unrecognised tag with nothing safe left is unknown without raw", () => {
  for (const ch of ["!!!", "<>", "日本"]) {
    const first = parseGameLinkChannel(ch);
    assertEquals(first, { code: null, channel: "unknown", raw: null });
    assertEquals(browserChannelTag(first), UNKNOWN_WITHOUT_RAW_TAG);
    assertEquals(roundTrip(ch), first);
  }
});

Deno.test("raw text that cleans down to a known code is dropped, not re-read as that channel", () => {
  const first = parseGameLinkChannel("r!");
  assertEquals(first, { code: null, channel: "unknown", raw: null });
  assertEquals(roundTrip("r!"), first);
});

Deno.test("inherited object names are not channel codes", () => {
  assertEquals(parseGameLinkChannel("constructor")?.channel, "unknown");
  assertEquals(parseGameLinkChannel("__proto__")?.channel, "unknown");
});

Deno.test("the copied link keeps the sanitized unknown tag", () => {
  assertEquals(linkChannelTag(parseGameLinkChannel("TikTok")), "tiktok");
  assertEquals(linkChannelTag(parseGameLinkChannel("!!!")), null);
});
