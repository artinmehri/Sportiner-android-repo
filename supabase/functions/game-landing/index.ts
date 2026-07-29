/**
 * SPO-260 — server-rendered game landing + App Store deferred handoff.
 *
 * Serve behind hosting rewrite for https://sportiner.com/g/{publicId}.
 * Deploy: supabase functions deploy game-landing --project-ref <ref> --no-verify-jwt
 *
 * Kill switch: DEFERRED_LINKS_ENABLED=1 enables provider handoff URLs when set.
 * Default is direct App Store + copy-link fallback (provider-independent).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  appStoreUrl,
  canonicalGameUrl,
  escapeHtml,
  installPromiseCopy,
  isDeferredWebHandoffEnabled,
  isJoinableState,
  normalizePublicId,
  normalizeShareCode,
  resolveInstallRedirect,
  type GameLandingState,
  type HandoffMethod,
} from "./handoff.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const PRODUCT_EVENT_URL = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/product-event`;

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  // POST /install — validate, emit analytics, return redirect target (no secrets).
  if (req.method === "POST" && url.pathname.endsWith("/install")) {
    return handleInstallPost(req);
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const publicId = extractPublicId(url);
  const shareCode = normalizeShareCode(url.searchParams.get("s") ?? url.searchParams.get("share_code"));

  if (!publicId) {
    return htmlResponse(renderUnavailablePage(null), 404);
  }

  const resolved = await resolvePublicGame(publicId, shareCode);
  void emitLandingViewed(req, publicId, resolved.state);
  void emitGameLinkOpened(req, publicId);

  return htmlResponse(
    renderLandingPage({
      publicId,
      shareCode,
      state: resolved.state,
      title: resolved.title,
      parkName: resolved.parkName,
      localWhen: resolved.localWhen,
    }),
  );
});

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") ?? "";
  const allow =
    origin === "https://sportiner.com" ||
    origin === "https://www.sportiner.com" ||
    origin.startsWith("http://localhost");
  return {
    "Access-Control-Allow-Origin": allow ? origin : "https://sportiner.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

function extractPublicId(url: URL): string | null {
  // Supports /g/{id}, /game-landing/g/{id}, and ?public_id=
  const parts = url.pathname.split("/").filter(Boolean);
  const gIndex = parts.lastIndexOf("g");
  if (gIndex >= 0 && parts[gIndex + 1]) {
    return normalizePublicId(parts[gIndex + 1]);
  }
  return normalizePublicId(url.searchParams.get("public_id"));
}

async function resolvePublicGame(
  publicId: string,
  shareCode: string | null,
): Promise<{
  state: GameLandingState;
  title: string | null;
  parkName: string | null;
  localWhen: string | null;
}> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { state: "unknown", title: null, parkName: null, localWhen: null };
  }

  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.rpc("resolve_public_game_v1", {
      public_id: publicId,
      share_code: shareCode,
    });
    if (error || !data || typeof data !== "object") {
      return { state: "not_found_or_restricted", title: null, parkName: null, localWhen: null };
    }
    const row = data as Record<string, unknown>;
    const state = (typeof row.state === "string" ? row.state : "unknown") as GameLandingState;
    const game = (row.game && typeof row.game === "object" ? row.game : null) as Record<
      string,
      unknown
    > | null;
    const title = typeof game?.title === "string" ? game.title : null;
    const parkName = typeof game?.park_name === "string" ? game.park_name : null;
    const date = typeof game?.local_date === "string" ? game.local_date : null;
    const time = typeof game?.local_time === "string" ? game.local_time : null;
    const localWhen = [date, time].filter(Boolean).join(" · ") || null;
    return { state, title, parkName, localWhen };
  } catch {
    return { state: "unknown", title: null, parkName: null, localWhen: null };
  }
}

async function handleInstallPost(req: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const publicId = normalizePublicId(
    typeof body.public_id === "string" ? body.public_id : null,
  );
  const shareCode = normalizeShareCode(
    typeof body.share_code === "string" ? body.share_code : null,
  );
  const country = typeof body.country === "string" ? body.country : null;
  const requestedMethod =
    typeof body.handoff_method === "string" ? body.handoff_method : null;

  if (!publicId) {
    return Response.json(
      { ok: false, error: "invalid_public_id" },
      { status: 400, headers: corsHeaders(req) },
    );
  }

  // Re-validate live state — terminal games still get App Store, without restore claims.
  const resolved = await resolvePublicGame(publicId, shareCode);

  if (requestedMethod === "copy_link") {
    void emitAppStoreRedirect(req, publicId, "copy_link", shareCode);
    return Response.json(
      {
        ok: true,
        handoff_method: "copy_link",
        canonical_url: canonicalGameUrl(publicId, shareCode),
        joinable: isJoinableState(resolved.state),
      },
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Provider link creation is optional and kill-switched. Never expose secrets.
  // When Branch is approved + DEFERRED_LINKS_ENABLED=1, inject a mapped URL here
  // from a server-side Branch key (not shipped to the browser).
  const providerHandoffUrl: string | null = null;

  const redirect = resolveInstallRedirect({
    publicId,
    shareCode,
    providerHandoffUrl,
    country,
  });

  void emitAppStoreRedirect(req, publicId, redirect.method, shareCode);

  return Response.json(
    {
      ok: true,
      redirect_url: redirect.url,
      handoff_method: redirect.method,
      joinable: isJoinableState(resolved.state),
      message: installPromiseCopy(resolved.state, redirect.method === "deferred_provider"),
      canonical_url: canonicalGameUrl(publicId, shareCode),
      deferred_enabled: isDeferredWebHandoffEnabled(),
    },
    { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
}

function newAnonymousIds(): { event_id: string; anonymous_id: string } {
  return {
    event_id: crypto.randomUUID(),
    anonymous_id: crypto.randomUUID(),
  };
}

async function postAnonymousEvent(
  eventName: string,
  properties: Record<string, unknown>,
  shareCode?: string | null,
): Promise<void> {
  if (!SUPABASE_ANON_KEY || !PRODUCT_EVENT_URL) return;
  const ids = newAnonymousIds();
  try {
    await fetch(PRODUCT_EVENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        event_name: eventName,
        event_id: ids.event_id,
        anonymous_id: ids.anonymous_id,
        platform: "web",
        properties,
        ...(shareCode ? { share_code: shareCode } : {}),
      }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Non-blocking.
  }
}

async function emitLandingViewed(
  req: Request,
  publicId: string,
  state: GameLandingState,
): Promise<void> {
  void req;
  await postAnonymousEvent("shared_game_landing_viewed", {
    game_public_id: publicId,
    game_state: state,
  });
}

async function emitGameLinkOpened(req: Request, publicId: string): Promise<void> {
  const referrerHost = (() => {
    const ref = req.headers.get("Referer") ?? req.headers.get("Referrer");
    if (!ref) return null;
    try {
      return new URL(ref).hostname.slice(0, 200);
    } catch {
      return null;
    }
  })();
  await postAnonymousEvent("game_link_opened", {
    game_public_id: publicId,
    entry_surface: "web_landing",
    ...(referrerHost ? { referrer_host: referrerHost } : {}),
  });
}

async function emitAppStoreRedirect(
  req: Request,
  publicId: string,
  method: HandoffMethod,
  shareCode?: string | null,
): Promise<void> {
  void req;
  await postAnonymousEvent(
    "app_store_redirect_started",
    {
      game_public_id: publicId,
      handoff_method: method,
    },
    shareCode,
  );
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=60",
      "Content-Security-Policy": [
        "default-src 'none'",
        "style-src 'unsafe-inline'",
        "script-src 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' https://*.supabase.co",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    },
  });
}

function renderUnavailablePage(publicId: string | null): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sportiner</title>
<style>
body{margin:0;font-family:Avenir Next,Segoe UI,sans-serif;background:#eef4f0;color:#14201a;padding:2rem 1.25rem}
.brand{font-family:Georgia,serif;font-size:1.6rem}
a{color:#1f6b4a;font-weight:600}
</style></head><body>
<p class="brand">Sportiner</p>
<h1>This game isn’t available</h1>
<p>The link may be invalid or the game may no longer be open.</p>
<p><a href="${escapeHtml(appStoreUrl())}">Get Sportiner on the App Store</a></p>
${publicId ? `<p><a href="${escapeHtml(canonicalGameUrl(publicId, null))}">Try the game link again</a></p>` : ""}
</body></html>`;
}

function renderLandingPage(input: {
  publicId: string;
  shareCode: string | null;
  state: GameLandingState;
  title: string | null;
  parkName: string | null;
  localWhen: string | null;
}): string {
  const canonical = canonicalGameUrl(input.publicId, input.shareCode);
  const openHref = canonical;
  const store = appStoreUrl();
  const joinable = isJoinableState(input.state);
  const headline = input.title?.trim() || "Open this tennis game in Sportiner";
  const meta = [input.parkName, input.localWhen].filter(Boolean).join(" · ");
  const stateNote = joinable
    ? "If Sportiner is installed, open it below. If not, install from the App Store, then come back to this page."
    : "This game may be full, finished, or unavailable. You can still install Sportiner and reopen this link.";
  const installNote = joinable
    ? "After install, reopen this page or the copied link so we can take you back to the game."
    : "After install, reopen this link to check the game. Availability may have changed—we won’t promise a joinable spot.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sportiner — ${escapeHtml(headline)}</title>
<style>
:root{--ink:#14201a;--muted:#4a5c54;--accent:#1f6b4a;--accent-ink:#f4fbf7}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;font-family:Georgia,"Iowan Old Style",serif;color:var(--ink);
background:radial-gradient(120% 80% at 10% 0%,#d7ebe0 0%,transparent 55%),linear-gradient(160deg,#f3f7f4,#dfece4 48%,#c9ddd2)}
main{max-width:28rem;margin:0 auto;padding:2.5rem 1.25rem 3rem}
.brand{font-size:1.75rem;margin:0 0 1.5rem}
h1{font-size:1.35rem;font-weight:600;line-height:1.25;margin:0 0 .5rem}
p{margin:0 0 1rem;color:var(--muted);font-family:"Avenir Next","Segoe UI",sans-serif;font-size:.98rem;line-height:1.45}
.meta{font-weight:600;color:var(--ink)}
.actions{display:grid;gap:.75rem;margin:1.5rem 0 1.25rem}
button,a.button{display:block;width:100%;text-align:center;text-decoration:none;border-radius:.65rem;padding:.9rem 1rem;font-family:"Avenir Next","Segoe UI",sans-serif;font-weight:600;border:0;cursor:pointer}
.primary{background:var(--accent);color:var(--accent-ink)}
.secondary{background:transparent;color:var(--accent);border:1.5px solid color-mix(in srgb,var(--accent) 55%,white)}
.tertiary{background:transparent;color:var(--muted);border:0;text-decoration:underline;padding:.4rem}
.note{background:#eef6f1;border-left:3px solid var(--accent);padding:.85rem 1rem;border-radius:0 .5rem .5rem 0;font-family:"Avenir Next","Segoe UI",sans-serif;font-size:.92rem}
#status{min-height:1.25rem;font-family:"Avenir Next","Segoe UI",sans-serif;font-size:.9rem;color:var(--muted)}
</style>
</head>
<body>
<main>
<p class="brand">Sportiner</p>
<h1>${escapeHtml(headline)}</h1>
${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}
<p>${escapeHtml(stateNote)}</p>
<div class="actions">
  <a class="button primary" id="openApp" href="${escapeHtml(openHref)}">Open in Sportiner</a>
  <button type="button" class="button secondary" id="getApp">Get Sportiner</button>
  <button type="button" class="tertiary" id="copyLink">Copy game link</button>
</div>
<p class="note" id="installNote">${escapeHtml(installNote)}</p>
<p id="status" role="status"></p>
</main>
<script>
(function () {
  var publicId = ${JSON.stringify(input.publicId)};
  var shareCode = ${JSON.stringify(input.shareCode)};
  var installPath = location.pathname.replace(/\\/?$/, "") + "/install";
  if (installPath.indexOf("/install") === -1) {
    installPath = "/functions/v1/game-landing/install";
  }
  var statusEl = document.getElementById("status");
  var noteEl = document.getElementById("installNote");
  var getBtn = document.getElementById("getApp");
  var copyBtn = document.getElementById("copyLink");
  var canonical = ${JSON.stringify(canonical)};
  var storeFallback = ${JSON.stringify(store)};

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ""; }

  getBtn.addEventListener("click", function () {
    getBtn.disabled = true;
    setStatus("Opening the App Store…");
    fetch(installPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_id: publicId, share_code: shareCode }),
      keepalive: true
    }).then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (data) {
        if (data && data.message && noteEl) noteEl.textContent = data.message;
        var target = (data && data.redirect_url) || storeFallback;
        location.href = target;
      }).catch(function () {
        location.href = storeFallback;
      }).finally(function () { getBtn.disabled = false; });
  });

  copyBtn.addEventListener("click", function () {
    var done = function () { setStatus("Game link copied. Reopen it after you install Sportiner."); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(canonical).then(done).catch(function () {
        window.prompt("Copy this game link", canonical);
        done();
      });
    } else {
      window.prompt("Copy this game link", canonical);
      done();
    }
    fetch(installPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_id: publicId, share_code: shareCode, handoff_method: "copy_link" }),
      keepalive: true
    }).catch(function () {});
  });
})();
</script>
</body>
</html>`;
}
