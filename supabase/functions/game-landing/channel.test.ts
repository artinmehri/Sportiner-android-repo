import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  browserChannelTag,
  linkChannelTag,
  parseGameLinkChannel,
  sanitizeUnknownTag,
  UNKNOWN_TAG_MAX,
  UNKNOWN_WITHOUT_TAG,
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
  assertEquals(roundTrip("r"), { code: "r", channel: "reddit", tag: null });
  assertEquals(roundTrip("lin"), { code: "lin", channel: "linkedin", tag: null });
  assertEquals(roundTrip(" W "), { code: "w", channel: "whatsapp", tag: null });
  assertEquals(browserChannelTag(parseGameLinkChannel("r")), "r");
  assertEquals(linkChannelTag(parseGameLinkChannel("r")), "r");
});

// Regression: bug 2a. An unrecognised tag used to reach the browser as null, so
// /context and /install events lost the channel entirely.
Deno.test("unrecognised tag stays unknown on follow-up events, with its tag", () => {
  const first = parseGameLinkChannel("TikTok");
  assertEquals(first, { code: null, channel: "unknown", tag: "tiktok" });
  assertEquals(browserChannelTag(first), "tiktok");
  assertEquals(roundTrip("TikTok"), first);
});

Deno.test("unrecognised tag keeps its sanitized tag across the round trip", () => {
  assertEquals(roundTrip("Tik Tok!"), { code: null, channel: "unknown", tag: "tiktok" });
  assertEquals(roundTrip("spring_2026-promo"), {
    code: null,
    channel: "unknown",
    tag: "spring_2026-promo",
  });
});

Deno.test("unrecognised tag with nothing safe left is unknown without a tag", () => {
  for (const ch of ["!!!", "<>", "日本"]) {
    const first = parseGameLinkChannel(ch);
    assertEquals(first, { code: null, channel: "unknown", tag: null });
    assertEquals(browserChannelTag(first), UNKNOWN_WITHOUT_TAG);
    assertEquals(roundTrip(ch), first);
  }
});

Deno.test("a tag that cleans down to a known code is dropped, not re-read as that channel", () => {
  const first = parseGameLinkChannel("r!");
  assertEquals(first, { code: null, channel: "unknown", tag: null });
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

Deno.test("unknown tags keep lowercase letters, digits, dash and underscore only", () => {
  assertEquals(sanitizeUnknownTag("Spring_2026-Promo"), "spring_2026-promo");
  assertEquals(sanitizeUnknownTag(" tik tok!?&=/%20 "), "tiktok20");
  assertEquals(sanitizeUnknownTag("naïve"), "nave");
  assertEquals(sanitizeUnknownTag("!!!"), null);
});

Deno.test("unknown tags are capped", () => {
  assertEquals(UNKNOWN_TAG_MAX, 64);
  assertEquals(sanitizeUnknownTag("a".repeat(5000)), "a".repeat(UNKNOWN_TAG_MAX));
});

Deno.test("script and HTML injection attempts come out inert", () => {
  const attempts = [
    "</script><script>alert(1)</script>",
    '"><img src=x onerror=alert(1)>',
    "';alert(1);//",
    "javascript:alert(1)",
  ];
  for (const attempt of attempts) {
    const out = sanitizeUnknownTag(attempt) ?? "";
    assert(/^[a-z0-9_-]*$/.test(out), `unsafe output for ${attempt}: ${out}`);
  }
});
