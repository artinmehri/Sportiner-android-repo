/**
 * Coarse request classification for the share funnel.
 *
 * A shared game URL is fetched automatically by every messaging and social app
 * that renders a link preview, so raw link-open counts overstate real recipients
 * by a wide margin. Classifying the request lets dashboards report human opens
 * without discarding the rows, which are still needed for operational counts.
 *
 * Only the class is ever persisted. The raw user-agent is a fingerprinting
 * surface and never reaches `product_events`.
 */

export type UserAgentClass = "bot" | "browser" | "app" | "unknown";

/**
 * Named preview fetchers and search crawlers. Several of these send a
 * browser-shaped user-agent and would otherwise pass as human. Applebot is what
 * fetches previews for iMessage.
 */
const NAMED_BOT_PATTERNS: readonly RegExp[] = [
  /facebookexternalhit/i,
  /facebookcatalog/i,
  /\bfacebot\b/i,
  /twitterbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /slackbot/i,
  /slack-imgproxy/i,
  /discordbot/i,
  /linkedinbot/i,
  /pinterest(bot)?/i,
  /redditbot/i,
  /skypeuripreview/i,
  /applebot/i,
  /googlebot/i,
  /adsbot-google/i,
  /google-inspectiontool/i,
  /storebot-google/i,
  /google-read-aloud/i,
  /bingbot/i,
  /bingpreview/i,
  /duckduckbot/i,
  /yandex(bot|images)/i,
  /baiduspider/i,
  /ahrefsbot/i,
  /semrushbot/i,
  /mj12bot/i,
  /dotbot/i,
  /petalbot/i,
  /vkshare/i,
  /embedly/i,
  /quora link preview/i,
  /nuzzel/i,
  /bitlybot/i,
  /tumblrurlresolver/i,
  /\bbot\b/i,
  /\bbots\b/i,
  /spider/i,
  /crawler/i,
  /crawling/i,
  /scraper/i,
  /link ?preview/i,
];

/**
 * Scripted clients and monitors. Kept separate from the named list because some
 * overlap with legitimate SDK traffic, so they are only consulted once the
 * request is known not to come from a native app.
 */
const SCRIPTED_CLIENT_PATTERNS: readonly RegExp[] = [
  /headless/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /curl\//i,
  /\bwget\b/i,
  /python-requests/i,
  /python-urllib/i,
  /go-http-client/i,
  /libwww-perl/i,
  /node-fetch/i,
  /uptime/i,
  /pingdom/i,
  /statuscake/i,
  /site24x7/i,
];

/** Native platforms report themselves; their traffic is never a web crawler. */
const NATIVE_PLATFORMS = new Set(["ios", "android"]);

const ALL_CLASSES = new Set<UserAgentClass>(["bot", "browser", "app", "unknown"]);

export function isUserAgentClass(value: unknown): value is UserAgentClass {
  return typeof value === "string" && ALL_CLASSES.has(value as UserAgentClass);
}

/** A self-identified crawler or link-preview fetcher. */
export function isNamedBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return NAMED_BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/** An HTTP library or monitor rather than a browser. */
export function isScriptedClientUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return SCRIPTED_CLIENT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * True for user-agents that fetch a URL with no person reading the result.
 *
 * `native` suppresses the scripted-client patterns: React Native ships requests
 * through okhttp and similar stacks, which look like scripts but are a real user.
 */
export function isCrawlerUserAgent(
  userAgent: string | null | undefined,
  native = false,
): boolean {
  if (isNamedBotUserAgent(userAgent)) return true;
  if (native) return false;
  return isScriptedClientUserAgent(userAgent);
}

export function classifyUserAgent(
  userAgent: string | null | undefined,
  platform?: string | null,
): UserAgentClass {
  const native = Boolean(platform && NATIVE_PLATFORMS.has(platform));
  if (isCrawlerUserAgent(userAgent, native)) return "bot";
  if (native) return "app";
  if (!userAgent) return "unknown";
  // Every real browser still ships the historical Mozilla/5.0 token.
  if (/mozilla\//i.test(userAgent)) return "browser";
  return "unknown";
}

/**
 * Server-authoritative class for an ingested event.
 *
 * Named crawlers always win, so a preview fetcher cannot launder itself as a
 * human by claiming `browser`.
 *
 * A caller-supplied class is honoured only when `trustClaimedClass` is true —
 * that flag is set only for requests authenticated with the service role
 * (landing SSR / trusted server hops). Anonymous callers that set
 * `platform: "server"` and a friendly class are ignored; classification falls
 * back to the request user-agent.
 */
export function resolveUserAgentClass(
  requestUserAgent: string | null | undefined,
  platform: string | null | undefined,
  claimedClass: unknown,
  trustClaimedClass = false,
): UserAgentClass {
  if (isNamedBotUserAgent(requestUserAgent)) return "bot";
  if (trustClaimedClass && isUserAgentClass(claimedClass)) return claimedClass;
  return classifyUserAgent(requestUserAgent, platform);
}
