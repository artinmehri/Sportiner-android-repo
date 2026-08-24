/**
 * SPO-247 product-event ingestion (authoritative monorepo source).
 * Supports constrained anonymous events, JWT-derived identity, idempotent event_id,
 * server-side public_id/share_code resolution, and alias action.
 *
 * Deploy: supabase functions deploy product-event --project-ref prswdcjmowfdvalyutlu
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6";
import {
  ALLOWED_ENVIRONMENTS,
  ALLOWED_PLATFORMS,
  CLOCK_SKEW_MS,
  FORBIDDEN_PROPERTY_KEYS,
  MAX_BODY_BYTES,
  MAX_PROPERTIES,
  MAX_PROPERTY_STRING,
  getEventDefinition,
  type AuthMode,
} from "./eventRegistry.ts";
import { resolveUserAgentClass } from "./userAgentClass.ts";

const FIREBASE_PROJECT_ID = "sportiner-1";
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

const ALLOWED_ORIGINS = new Set([
  "https://sportiner.com",
  "https://www.sportiner.com",
  "https://sportiner-1.web.app",
  "https://sportiner-1.firebaseapp.com",
  "http://localhost:4200",
  "http://localhost:4300",
  "http://127.0.0.1:4300",
  "http://localhost:5000",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
]);

const PUBLIC_ID_RE = /^[a-f0-9]{32}$/;
const SHARE_CODE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Manually tagged game-link acquisition channels (`?ch=`). */
const ALLOWED_CHANNEL_HINTS = new Set([
  "reddit",
  "facebook",
  "luma",
  "eventbrite",
  "instagram",
  "linkedin",
  "whatsapp",
]);

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

type Actor = {
  provider: "firebase" | "supabase" | "anonymous" | "server";
  firebaseUid: string | null;
  userId: string | null;
  userEmail: string | null;
};

/** Constant-time compare so service-role probes cannot short-circuit on length. */
function secretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, apikey, x-client-info, x-sportiner-anonymous-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Type": "application/json",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

function safeText(value: unknown, maxLength = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeChannelHint(value: unknown): string | null {
  const text = safeText(value, 80)?.toLowerCase() ?? null;
  if (!text) return null;
  return ALLOWED_CHANNEL_HINTS.has(text) ? text : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function abuseKey(request: Request, anonymousId: string | null): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const truncatedIp = forwarded.slice(0, 64);
  const material = `${truncatedIp}|${anonymousId ?? "noanon"}`;
  // Truncated fingerprint only — never stored on product_events.
  let hash = 0;
  for (let i = 0; i < material.length; i++) {
    hash = (hash * 31 + material.charCodeAt(i)) >>> 0;
  }
  return `r${hash.toString(16)}`;
}

function allowRequest(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

function sanitizeProperties(
  value: unknown,
  allowed: readonly string[],
): { ok: true; properties: Record<string, string | number | boolean | null> } | {
  ok: false;
  error: string;
} {
  if (value == null) return { ok: true, properties: {} };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "properties must be an object." };
  }

  const allowedSet = new Set(allowed);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_PROPERTIES) {
    return { ok: false, error: "Too many properties." };
  }

  const properties: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, entry] of entries) {
    const key = rawKey.slice(0, 80);
    if (!key) continue;
    if (FORBIDDEN_PROPERTY_KEYS.has(key) || FORBIDDEN_PROPERTY_KEYS.has(key.toLowerCase())) {
      return { ok: false, error: `Forbidden property: ${key}` };
    }
    if (!allowedSet.has(key)) {
      return { ok: false, error: `Unknown property: ${key}` };
    }
    if (typeof entry === "string") properties[key] = entry.slice(0, MAX_PROPERTY_STRING);
    else if (typeof entry === "number" && Number.isFinite(entry)) properties[key] = entry;
    else if (typeof entry === "boolean") properties[key] = entry;
    else if (entry === null) properties[key] = null;
    else {
      return { ok: false, error: `Invalid property type for ${key}` };
    }
  }

  return { ok: true, properties };
}

async function verifyFirebaseToken(token: string): Promise<Actor | null> {
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      algorithms: ["RS256"],
      audience: FIREBASE_PROJECT_ID,
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      clockTolerance: 5,
    });
    if (!payload.sub) return null;
    return {
      provider: "firebase",
      firebaseUid: String(payload.sub),
      userId: null,
      userEmail: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    };
  } catch {
    return null;
  }
}

async function verifySupabaseToken(
  token: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<Actor | null> {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return {
    provider: "supabase",
    firebaseUid: null,
    userId: data.user.id,
    userEmail: data.user.email?.toLowerCase() ?? null,
  };
}

function authAllowed(mode: AuthMode, actor: Actor): boolean {
  if (mode === "server_only") return actor.provider === "server";
  if (mode === "anonymous") return true;
  if (mode === "either") return true;
  return actor.provider !== "anonymous" &&
    actor.provider !== "server" &&
    (!!actor.userId || !!actor.firebaseUid);
}

async function resolveShareAndGame(
  supabase: ReturnType<typeof createClient>,
  shareCode: string | null,
  gamePublicId: string | null,
): Promise<{ linkId: string | null; resolvedGameId: string | null; publicId: string | null }> {
  let linkId: string | null = null;
  let resolvedGameId: string | null = null;
  let publicId = gamePublicId && PUBLIC_ID_RE.test(gamePublicId) ? gamePublicId : null;

  if (shareCode && SHARE_CODE_RE.test(shareCode)) {
    // SPO-248 table may not exist yet — probe safely.
    const { data: linkRows, error } = await supabase
      .from("game_share_links")
      .select("id, game_id, revoked_at, expires_at")
      .eq("share_code", shareCode)
      .limit(1);

    if (!error && linkRows?.[0]) {
      const row = linkRows[0] as {
        id: string;
        game_id: string;
        revoked_at: string | null;
        expires_at: string | null;
      };
      const expired = row.expires_at ? Date.parse(row.expires_at) < Date.now() : false;
      if (!row.revoked_at && !expired) {
        linkId = row.id;
        resolvedGameId = row.game_id;
        const { data: game } = await supabase
          .from("games")
          .select("public_id")
          .eq("id", row.game_id)
          .maybeSingle();
        if (game?.public_id) publicId = String(game.public_id);
      }
    }
  }

  if (!resolvedGameId && publicId) {
    const { data: game } = await supabase
      .from("games")
      .select("id, public_id")
      .eq("public_id", publicId)
      .maybeSingle();
    if (game?.id) {
      resolvedGameId = game.id as string;
      publicId = String(game.public_id);
    }
  }

  return { linkId, resolvedGameId, publicId };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse({ error: "This origin is not allowed." }, 403, null);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, origin);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Payload too large." }, 413, origin);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Payload too large." }, 413, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "A valid JSON request body is required." }, 400, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "The event service is not configured." }, 503, origin);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const action = safeText(body.action, 40) ?? "ingest";

  const authorization = request.headers.get("authorization") ?? "";
  let actor: Actor = {
    provider: "anonymous",
    firebaseUid: null,
    userId: null,
    userEmail: null,
  };

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (authorization.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length);
    if (secretsEqual(token, serviceRoleKey)) {
      actor = {
        provider: "server",
        firebaseUid: null,
        userId: null,
        userEmail: null,
      };
    } else if (anonKey && secretsEqual(token, anonKey)) {
      // supabase-js sends the anon key as Bearer when logged out — stay anonymous.
    } else {
      actor = (await verifyFirebaseToken(token)) ??
        (await verifySupabaseToken(token, supabaseUrl, serviceRoleKey)) ??
        actor;
      if (actor.provider === "anonymous") {
        return jsonResponse({ error: "A valid session is required." }, 401, origin);
      }
    }
  }

  // ---- Alias --------------------------------------------------------------
  if (action === "alias") {
    if (!actor.userId) {
      return jsonResponse({ error: "Authentication is required for alias." }, 401, origin);
    }
    const anonymousId = isUuid(body.anonymousId)
      ? body.anonymousId
      : isUuid(body.anonymous_id)
      ? body.anonymous_id
      : null;
    if (!anonymousId) {
      return jsonResponse({ error: "anonymous_id is required." }, 400, origin);
    }

    if (!anonKey || !authorization.startsWith("Bearer ") || !actor.userId) {
      return jsonResponse({ error: "The event service is not configured." }, 503, origin);
    }

    // Caller JWT required so auth.uid() matches the verified actor.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await userClient.rpc("alias_analytics_identity_v1", {
      p_anonymous_id: anonymousId,
      p_source: safeText(body.source, 40) ?? "app",
    });

    if (error) {
      const status = error.code === "23505" ? 409 : 400;
      return jsonResponse({ error: error.message }, status, origin);
    }
    return jsonResponse({ ok: true, ...((data as object) ?? {}) }, 200, origin);
  }

  // ---- Record acquisition attribution (SPO-261) ---------------------------
  if (action === "record_attribution") {
    const anonymousId = isUuid(body.anonymousId)
      ? body.anonymousId
      : isUuid(body.anonymous_id)
      ? body.anonymous_id
      : null;
    const publicIdRaw = safeText(body.public_id ?? body.publicId, 64);
    const publicId = publicIdRaw && PUBLIC_ID_RE.test(publicIdRaw.toLowerCase())
      ? publicIdRaw.toLowerCase()
      : null;
    const shareCodeRaw = safeText(body.share_code ?? body.shareCode, 128);
    const shareCode = shareCodeRaw && SHARE_CODE_RE.test(shareCodeRaw) ? shareCodeRaw : null;

    if (!anonymousId) {
      return jsonResponse({ error: "anonymous_id is required." }, 400, origin);
    }
    if (!publicId) {
      return jsonResponse({ error: "public_id is required." }, 400, origin);
    }

    // Reject client-supplied privileged fields (never forward to the RPC).
    if (
      body.link_id != null ||
      body.linkId != null ||
      body.user_id != null ||
      body.userId != null ||
      body.host_id != null ||
      body.hostId != null ||
      body.game_id != null ||
      body.gameId != null
    ) {
      return jsonResponse({ error: "Privileged attribution fields are not accepted." }, 400, origin);
    }

    if (!anonKey) {
      return jsonResponse({ error: "The event service is not configured." }, 503, origin);
    }

    if (!allowRequest(abuseKey(request, anonymousId))) {
      return jsonResponse({ error: "Rate limit exceeded." }, 429, origin);
    }

    // Authenticated: caller JWT so auth.uid() attaches user_id.
    // Anonymous: service-role RPC (anon execute revoked) — still never trusts client user_id.
    const rpcClient = actor.userId && authorization.startsWith("Bearer ")
      ? createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      : supabase;

    const meta = typeof body.metadata === "object" && body.metadata && !Array.isArray(body.metadata)
      ? body.metadata as Record<string, unknown>
      : {};

    const { data, error } = await rpcClient.rpc("record_acquisition_attribution_v1", {
      p_anonymous_id: anonymousId,
      p_public_id: publicId,
      p_share_code: shareCode,
      p_provider: safeText(body.provider, 40) ?? "canonical_link",
      p_match_type: safeText(body.match_type ?? body.matchType, 40) ?? "universal_link",
      p_touch_type: safeText(body.touch_type ?? body.touchType, 40) ?? "recovery",
      p_confidence: safeText(body.confidence, 16) ?? "medium",
      p_idempotency_key: safeText(body.idempotency_key ?? body.idempotencyKey, 128),
      p_metadata: {
        source_surface: safeText(meta.source_surface ?? meta.sourceSurface, 64),
        touch_hint: safeText(meta.touch_hint ?? meta.touchHint, 64),
      },
    });

    if (error) {
      const status = error.code === "23505" ? 409 : 400;
      return jsonResponse({ error: error.message, code: error.code }, status, origin);
    }
    return jsonResponse({ ok: true, ...((data as object) ?? {}) }, 200, origin);
  }

  // ---- Ingest -------------------------------------------------------------
  const eventName = safeText(body.eventName ?? body.event_name, 80);
  if (!eventName) {
    return jsonResponse({ error: "event_name is required." }, 400, origin);
  }

  const definition = getEventDefinition(eventName);
  if (!definition) {
    return jsonResponse({ error: "Unsupported product event." }, 400, origin);
  }

  if (!authAllowed(definition.auth, actor)) {
    return jsonResponse({ error: "This event requires authentication." }, 401, origin);
  }

  const anonymousId = isUuid(body.anonymousId)
    ? body.anonymousId
    : isUuid(body.anonymous_id)
    ? body.anonymous_id
    : null;

  if (definition.auth === "anonymous" || definition.auth === "either") {
    if (actor.provider === "anonymous" && !anonymousId) {
      return jsonResponse({ error: "anonymous_id is required." }, 400, origin);
    }
  }

  if (!allowRequest(abuseKey(request, anonymousId))) {
    return jsonResponse({ error: "Rate limit exceeded." }, 429, origin);
  }

  const eventId = isUuid(body.eventId)
    ? body.eventId
    : isUuid(body.event_id)
    ? body.event_id
    : null;
  if (!eventId) {
    return jsonResponse({ error: "event_id UUID is required." }, 400, origin);
  }

  const eventVersion = Number(body.eventVersion ?? body.event_version ?? 1);
  if (!Number.isInteger(eventVersion) || eventVersion < 1 || eventVersion > 100) {
    return jsonResponse({ error: "event_version must be a positive integer." }, 400, origin);
  }

  const occurredRaw = safeText(body.occurredAt ?? body.occurred_at, 40);
  let occurredAt = new Date();
  if (occurredRaw) {
    const parsed = Date.parse(occurredRaw);
    if (Number.isNaN(parsed)) {
      return jsonResponse({ error: "occurred_at is invalid." }, 400, origin);
    }
    if (Math.abs(Date.now() - parsed) > CLOCK_SKEW_MS) {
      return jsonResponse({ error: "occurred_at outside allowed clock skew." }, 400, origin);
    }
    occurredAt = new Date(parsed);
  }

  const environment = safeText(body.environment, 32) ?? "production";
  if (!ALLOWED_ENVIRONMENTS.has(environment)) {
    return jsonResponse({ error: "Invalid environment." }, 400, origin);
  }

  const platform = safeText(body.platform, 32);
  if (platform && !ALLOWED_PLATFORMS.has(platform)) {
    return jsonResponse({ error: "Invalid platform." }, 400, origin);
  }

  const sessionId = isUuid(body.sessionId)
    ? body.sessionId
    : isUuid(body.session_id)
    ? body.session_id
    : safeText(body.sessionId ?? body.session_id, 160);

  // Reject client-asserted privileged identity / attribution fields.
  if (body.userId != null || body.user_id != null || body.hostId != null || body.host_id != null) {
    return jsonResponse({ error: "Client cannot assert user or host identity." }, 400, origin);
  }
  if (body.linkId != null || body.link_id != null) {
    return jsonResponse({ error: "link_id is server-resolved only." }, 400, origin);
  }

  const propsSource = body.properties ?? body.metadata ?? {};
  const sanitized = sanitizeProperties(propsSource, definition.allowedProperties);
  if (!sanitized.ok) {
    return jsonResponse({ error: sanitized.error }, 400, origin);
  }

  for (const required of definition.requiredProperties ?? []) {
    if (
      sanitized.properties[required] === undefined ||
      sanitized.properties[required] === null ||
      sanitized.properties[required] === ""
    ) {
      return jsonResponse({ error: `Missing required property: ${required}` }, 400, origin);
    }
  }

  // Stamped server-side so a preview crawler cannot present itself as a human
  // open. Every row is still stored; dashboards separate human from bot counts.
  // Claimed class is only trusted from the service-role hop (landing SSR).
  // Anonymous callers may not launder traffic by asserting platform=server.
  if (definition.allowedProperties.includes("user_agent_class")) {
    const trustClaimedClass = actor.provider === "server";
    const classificationPlatform =
      platform === "server" && !trustClaimedClass ? null : platform;
    sanitized.properties.user_agent_class = resolveUserAgentClass(
      request.headers.get("user-agent"),
      classificationPlatform,
      sanitized.properties.user_agent_class,
      trustClaimedClass,
    );
  }

  const gamePublicId = safeText(
    body.gamePublicId ?? body.game_public_id ?? sanitized.properties.game_public_id,
    64,
  );
  const shareCode = safeText(body.shareCode ?? body.share_code, 128);
  if (gamePublicId && !PUBLIC_ID_RE.test(gamePublicId)) {
    return jsonResponse({ error: "Invalid game_public_id." }, 400, origin);
  }
  if (shareCode && !SHARE_CODE_RE.test(shareCode)) {
    return jsonResponse({ error: "Invalid share_code." }, 400, origin);
  }

  const resolved = await resolveShareAndGame(supabase, shareCode, gamePublicId);

  // Persist only columns that exist on the slim product_events table.
  // Request-level fields (anonymous_id, event_version, environment, share
  // resolution, etc.) stay in the API contract / metadata when useful.
  const metadata: Record<string, unknown> = { ...sanitized.properties };
  if (anonymousId) metadata.anonymous_id = anonymousId;
  metadata.event_version = eventVersion;
  metadata.environment = environment;
  if (shareCode) metadata.share_id = shareCode;
  if (resolved.linkId) metadata.link_id = resolved.linkId;
  if (resolved.resolvedGameId) metadata.resolved_game_id = resolved.resolvedGameId;
  if (actor.provider !== "anonymous") metadata.auth_provider = actor.provider;

  const { error } = await supabase.from("product_events").upsert(
    {
      event_id: eventId,
      event_name: eventName,
      user_id: actor.userId,
      game_id: resolved.publicId,
      session_id: sessionId,
      platform: platform ?? (actor.provider === "anonymous" ? "web" : null),
      channel_hint: normalizeChannelHint(body.channelHint ?? body.channel_hint),
      metadata,
      occurred_at: occurredAt.toISOString(),
      received_at: new Date().toISOString(),
    },
    { onConflict: "event_id", ignoreDuplicates: true },
  );

  if (error) {
    console.error("Product event ingest failed", {
      operation: "product_events.upsert",
      event_id: eventId,
      event_name: eventName,
      code: error.code,
      message: error.message,
    });
    return jsonResponse({ error: "Product event could not be stored." }, 502, origin);
  }

  return jsonResponse(
    {
      ok: true,
      event_id: eventId,
      link_id: resolved.linkId,
      game_public_id: resolved.publicId,
    },
    200,
    origin,
  );
});
