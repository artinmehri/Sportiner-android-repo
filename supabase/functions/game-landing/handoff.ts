/**
 * SPO-260 — web → App Store deferred handoff helpers (provider-independent).
 * Canonical URLs stay https://sportiner.com/g/{publicId}?s=…
 */

export const PUBLIC_ID_RE = /^[a-f0-9]{32}$/;
export const SHARE_CODE_RE = /^[A-Za-z0-9_-]{16,128}$/;

/** App Store listing from EAS submit config (ascAppId). */
export const APP_STORE_ID = "6758223656";

export type GameLandingState =
  | "available"
  | "full"
  | "cancelled"
  | "completed"
  | "started"
  | "not_found_or_restricted"
  | "maintenance"
  | "unknown";

export type HandoffMethod =
  | "universal_link"
  | "direct_app_store"
  | "deferred_provider"
  | "copy_link"
  | "provider_outage_fallback";

export function isDeferredWebHandoffEnabled(): boolean {
  return Deno.env.get("DEFERRED_LINKS_ENABLED") === "1";
}

export function normalizePublicId(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase() ?? "";
  return PUBLIC_ID_RE.test(v) ? v : null;
}

export function normalizeShareCode(value: string | null | undefined): string | null {
  const v = value?.trim() ?? "";
  if (!v) return null;
  return SHARE_CODE_RE.test(v) ? v : null;
}

export function canonicalGameUrl(
  publicId: string,
  shareCode: string | null,
  channelCode: string | null = null,
): string {
  const params = new URLSearchParams();
  if (shareCode) {
    params.set("s", shareCode);
  }
  if (channelCode) {
    params.set("ch", channelCode);
  }
  const query = params.toString();
  return query
    ? `https://sportiner.com/g/${publicId}?${query}`
    : `https://sportiner.com/g/${publicId}`;
}

/** Country-safe Apple URL; omit country for Apple’s locale negotiation. */
export function appStoreUrl(options?: { country?: string | null }): string {
  const country = options?.country?.trim().toLowerCase();
  if (country && /^[a-z]{2}$/.test(country)) {
    return `https://apps.apple.com/${country}/app/id${APP_STORE_ID}`;
  }
  return `https://apps.apple.com/app/id${APP_STORE_ID}`;
}

export function isJoinableState(state: GameLandingState): boolean {
  return state === "available";
}

export function installPromiseCopy(state: GameLandingState, handoffOk: boolean): string {
  if (!isJoinableState(state)) {
    return "Install Sportiner, then reopen this link to find the game. Availability may have changed.";
  }
  if (handoffOk) {
    return "Install Sportiner, then open it—we’ll bring this game back.";
  }
  return "Install Sportiner, then reopen this link to find the game.";
}

/**
 * Build the install redirect target. When deferred provider is disabled or fails,
 * always fall back to the direct App Store listing (never a dead end).
 */
export function resolveInstallRedirect(input: {
  publicId: string;
  shareCode: string | null;
  providerHandoffUrl?: string | null;
  country?: string | null;
}): { url: string; method: HandoffMethod } {
  if (!isDeferredWebHandoffEnabled()) {
    return { url: appStoreUrl({ country: input.country }), method: "direct_app_store" };
  }
  const providerUrl = input.providerHandoffUrl?.trim() ?? "";
  if (isAllowedProviderHandoffUrl(providerUrl)) {
    return { url: providerUrl, method: "deferred_provider" };
  }
  return {
    url: appStoreUrl({ country: input.country }),
    method: "provider_outage_fallback",
  };
}

/** Only Apple + approved Branch hosts — never echo arbitrary https URLs. */
export function isAllowedProviderHandoffUrl(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "apps.apple.com" ||
      host === "app.link" ||
      host.endsWith(".app.link") ||
      host === "bnc.lt" ||
      host.endsWith(".bnc.lt")
    );
  } catch {
    return false;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
