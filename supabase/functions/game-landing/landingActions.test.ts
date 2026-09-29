import { assertEquals } from "jsr:@std/assert@1";
import { landingPageLinks, parseGameLinkChannel, taggedGameUrl } from "./channel.ts";

const PUBLIC_ID = "0123456789abcdef0123456789abcdef";
const SHARE_CODE = "abcdefghijklmnop";

/** What game-landing's /install handler derives from the body the page posts. */
function installResponse(body: { public_id: string; share_code: string; ch?: string }) {
  const channel = parseGameLinkChannel(typeof body.ch === "string" ? body.ch : null);
  return {
    channelHint: channel?.channel ?? null,
    canonicalUrl: taggedGameUrl(body.public_id, body.share_code, channel),
  };
}

/** The page's installBody(): the tag goes along only when there is one. */
function pageInstallBody(browserTag: string | null) {
  return {
    public_id: PUBLIC_ID,
    share_code: SHARE_CODE,
    ...(browserTag ? { ch: browserTag } : {}),
  };
}

function channelOfLink(url: string) {
  return parseGameLinkChannel(new URL(url).searchParams.get("ch"));
}

// Regression: Open in Sportiner used to drop an unrecognised tag while Copy game
// link and Get Sportiner kept it. All three must agree.
Deno.test("open, copy and install all carry an unrecognised tag as unknown", () => {
  for (const ch of ["tiktok", "TikTok", "Spring_2026-Promo"]) {
    const links = landingPageLinks(PUBLIC_ID, SHARE_CODE, parseGameLinkChannel(ch));
    const expectedTag = ch.toLowerCase();

    // Open in Sportiner: the link itself keeps the tag.
    assertEquals(new URL(links.openHref).searchParams.get("ch"), expectedTag);
    assertEquals(channelOfLink(links.openHref)?.channel, "unknown");

    // Copy game link: the copied link keeps the tag, and its /install call is unknown.
    assertEquals(links.copyUrl, links.openHref);
    assertEquals(channelOfLink(links.copyUrl)?.channel, "unknown");
    const copied = installResponse(pageInstallBody(links.browserTag));
    assertEquals(copied.channelHint, "unknown");
    assertEquals(copied.canonicalUrl, links.openHref);

    // Get Sportiner: the /install call is unknown and hands back the same link.
    const installed = installResponse(pageInstallBody(links.browserTag));
    assertEquals(installed.channelHint, "unknown");
    assertEquals(installed.canonicalUrl, links.openHref);
  }
});

Deno.test("an unrecognised tag with nothing safe left is still unknown on install and copy", () => {
  const links = landingPageLinks(PUBLIC_ID, SHARE_CODE, parseGameLinkChannel("!!!"));
  assertEquals(installResponse(pageInstallBody(links.browserTag)).channelHint, "unknown");
  // Nothing safe to put in a URL, so the links carry no tag.
  assertEquals(new URL(links.openHref).searchParams.get("ch"), null);
  assertEquals(links.copyUrl, links.openHref);
});

Deno.test("open, copy and install all carry a known tag unchanged", () => {
  const links = landingPageLinks(PUBLIC_ID, SHARE_CODE, parseGameLinkChannel("r"));
  assertEquals(channelOfLink(links.openHref)?.channel, "reddit");
  assertEquals(links.copyUrl, links.openHref);
  const installed = installResponse(pageInstallBody(links.browserTag));
  assertEquals(installed.channelHint, "reddit");
  assertEquals(installed.canonicalUrl, links.openHref);
});

Deno.test("no tag stays untagged on open, copy and install", () => {
  const links = landingPageLinks(PUBLIC_ID, SHARE_CODE, parseGameLinkChannel(null));
  assertEquals(new URL(links.openHref).searchParams.get("ch"), null);
  assertEquals(links.copyUrl, links.openHref);
  const installed = installResponse(pageInstallBody(links.browserTag));
  assertEquals(installed.channelHint, null);
  assertEquals(installed.canonicalUrl, links.openHref);
});
