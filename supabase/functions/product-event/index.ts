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
  ACQUISITION_EVENTS,
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

/**
 * Canonical acquisition channels. The first seven come from a manual `?ch=` tag;
 * `app` is stamped server-side from platform and `unknown` marks a tag we do not
 * publish. Queries that mean "marketing traffic" must name the seven explicitly
 * rather than testing `channel_hint is not null`.
 */
const ALLOWED_CHANNEL_HINTS = new Set([
  "reddit",
  "facebook",
  "luma",
  "eventbrite",
  "instagram",
  "linkedin",
  "whatsapp",
  "app",
  "unknown",
]);

const DEVICE_TYPES = new Set(["mobile", "tablet", "desktop", "unknown"]);
const CONNECTION_TYPES = new Set(["slow-2g", "2g", "3g", "4g", "unknown"]);
const SCREEN_RESOLUTION_RE = /^\d{1,5}x\d{1,5}$/;
const LANGUAGE_RE = /^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8}){0,4}$/;
const IP_RE = /^[0-9a-fA-F:.]{3,45}$/;

/** Device-signal acquisition matching (Task 4). */
const MATCH_WINDOW_MS = 5 * 60 * 1000;
const MATCH_CANDIDATE_LIMIT = 200;
const MATCH_THRESHOLD = 3;
const MATCH_POINTS = { ip: 3, resolution: 2, language: 1 } as const;

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
      "Authorization, Content-Type, apikey, x-client-info, x-sportiner-anonymous-id, x-sportiner-landing-secret",
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

/**
 * Device/network context written to real columns rather than metadata. Every
 * field is best-effort browser data, so anything unrecognised is dropped instead
 * of failing the event — the DB check constraints cover the same vocabularies.
 */
function deviceContext(body: Record<string, unknown>): Record<string, string> {
  const context: Record<string, string> = {};

  const deviceType = safeText(body.device_type ?? body.deviceType, 32)?.toLowerCase();
  if (deviceType && DEVICE_TYPES.has(deviceType)) context.device_type = deviceType;

  const connectionType = safeText(
    body.connection_type ?? body.connectionType,
    32,
  )?.toLowerCase();
  if (connectionType && CONNECTION_TYPES.has(connectionType)) {
    context.connection_type = connectionType;
  }

  const resolution = safeText(
    body.screen_resolution ?? body.screenResolution,
    16,
  )?.toLowerCase();
  if (resolution && SCREEN_RESOLUTION_RE.test(resolution)) {
    context.screen_resolution = resolution;
  }

  const language = safeText(body.device_language ?? body.deviceLanguage, 35);
  if (language && LANGUAGE_RE.test(language)) context.device_language = language;

  return context;
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

type MatchSignals = {
  deviceType: string;
  language: string | null;
  resolution: string | null;
  ip: string | null;
};

type CandidateRow = {
  occurred_at: string;
  game_id: string | null;
  device_type: string | null;
  device_language: string | null;
  screen_resolution: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
};

function requestIp(request: Request): string | null {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (!first || first.length > 45) return null;
  return IP_RE.test(first) ? first : null;
}

/** Orientation-independent: a landscape web visit still matches a portrait signup. */
function normalizeResolution(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!SCREEN_RESOLUTION_RE.test(text)) return null;
  const [a, b] = text.split("x").map(Number);
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}

/** `en-US`, `en_GB` and `en` all compare equal — full tags would rarely match. */
function primaryLanguage(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!text) return null;
  const primary = text.replace(/_/g, "-").split("-")[0];
  return /^[a-z]{2,8}$/.test(primary) ? primary : null;
}

function scoreCandidate(row: CandidateRow, signals: MatchSignals): number {
  let score = 0;
  if (signals.ip && row.ip_address && String(row.ip_address) === signals.ip) {
    score += MATCH_POINTS.ip;
  }
  if (
    signals.resolution &&
    normalizeResolution(row.screen_resolution) === signals.resolution
  ) {
    score += MATCH_POINTS.resolution;
  }
  if (signals.language && primaryLanguage(row.device_language) === signals.language) {
    score += MATCH_POINTS.language;
  }
  return score;
}

/**
 * Rows stamped at the same instant with the same device signature are one visit
 * recorded twice, not two people. Collapsing them stops a duplicate from
 * outranking a genuinely distinct candidate.
 */
function dedupeCandidates(rows: CandidateRow[]): CandidateRow[] {
  const seen = new Set<string>();
  const unique: CandidateRow[] = [];
  for (const row of rows) {
    const key = [
      row.occurred_at,
      row.device_type ?? "",
      normalizeResolution(row.screen_resolution) ?? "",
      primaryLanguage(row.device_language) ?? "",
      row.ip_address ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

/**
 * Best score wins; recency breaks ties because rows arrive newest-first and a
 * later row only displaces on a strictly higher score. Aggregate channel totals
 * stay correct even when two lookalike visitors are swapped.
 */
function pickBestCandidate(
  rows: CandidateRow[],
  signals: MatchSignals,
): { row: CandidateRow; score: number; anonymousId: string } | null {
  let best: { row: CandidateRow; score: number; anonymousId: string } | null = null;

  for (const row of rows) {
    // Hard gate: a desktop web visit is not a phone signup. Cross-device
    // journeys are out of reach with these signals either way.
    if ((row.device_type ?? "") !== signals.deviceType) continue;

    // The RPC requires a public_id; a visit we could not resolve is unusable.
    if (!row.game_id) continue;

    const anonymousId = row.metadata?.anonymous_id;
    if (typeof anonymousId !== "string" || !UUID_RE.test(anonymousId)) continue;

    const score = scoreCandidate(row, signals);
    if (score < MATCH_THRESHOLD) continue;
    if (!best || score > best.score) best = { row, score, anonymousId };
  }

  return best;
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

  // ---- Device-signal acquisition match ------------------------------------
  if (action === "match_acquisition") {
    if (!actor.userId) {
      return jsonResponse(
        { error: "Authentication is required for matching." },
        401,
        origin,
      );
    }
    if (!anonKey || !authorization.startsWith("Bearer ")) {
      return jsonResponse({ error: "The event service is not configured." }, 503, origin);
    }

    const deviceType = safeText(body.device_type ?? body.deviceType, 32)?.toLowerCase();
    if (!deviceType || !DEVICE_TYPES.has(deviceType)) {
      return jsonResponse({ error: "device_type is required." }, 400, origin);
    }

    const rawLanguage = safeText(body.device_language ?? body.deviceLanguage, 35);
    const rawResolution = safeText(
      body.screen_resolution ?? body.screenResolution,
      16,
    );
    const matchPlatform = safeText(body.platform, 32);
    if (matchPlatform && !ALLOWED_PLATFORMS.has(matchPlatform)) {
      return jsonResponse({ error: "Invalid platform." }, 400, origin);
    }

    const signals: MatchSignals = {
      deviceType,
      language: primaryLanguage(rawLanguage),
      resolution: normalizeResolution(rawResolution),
      ip: requestIp(request),
    };

    if (!allowRequest(abuseKey(request, actor.userId))) {
      return jsonResponse({ error: "Rate limit exceeded." }, 429, origin);
    }

    const since = new Date(Date.now() - MATCH_WINDOW_MS).toISOString();
    const { data: candidateRows, error: candidateError } = await supabase
      .from("product_events")
      .select(
        "occurred_at, game_id, device_type, device_language, screen_resolution, ip_address, metadata",
      )
      .eq("event_name", "landing_client_context")
      .gte("occurred_at", since)
      .not("game_id", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(MATCH_CANDIDATE_LIMIT);

    if (candidateError) {
      console.error("Acquisition candidate lookup failed", {
        operation: "product_events.select",
        code: candidateError.code,
        message: candidateError.message,
      });
      return jsonResponse({ error: "Candidate lookup failed." }, 502, origin);
    }

    const candidates = dedupeCandidates((candidateRows ?? []) as CandidateRow[]);
    const best = pickBestCandidate(candidates, signals);
    const confidence = best && best.score >= 5 ? "high" : "medium";

    let recorded: Record<string, unknown> | null = null;
    let recordError: string | null = null;

    if (best) {
      const rpcClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const shareCodeRaw = typeof best.row.metadata?.share_id === "string"
        ? best.row.metadata.share_id
        : null;
      const shareCode = shareCodeRaw && SHARE_CODE_RE.test(shareCodeRaw)
        ? shareCodeRaw
        : null;

      // Known low-priority edge case: the RPC's idempotency key omits user_id,
      // so if two people match the same visit on the same day the second gets
      // `already_recorded` and no row of its own. Left as-is deliberately.
      const callRpc = (code: string | null) =>
        rpcClient.rpc("record_acquisition_attribution_v1", {
          p_anonymous_id: best.anonymousId,
          p_public_id: best.row.game_id,
          p_share_code: code,
          p_provider: "device_match",
          p_match_type: "device_signal",
          p_touch_type: "signup",
          p_confidence: confidence,
          p_idempotency_key: null,
          p_metadata: {
            source_surface: "onboarding_completed",
            touch_hint: "device_signal",
          },
        });

      let { data: rpcData, error: rpcError } = await callRpc(shareCode);

      // A revoked or expired code records nothing at all; fall back to a
      // game-level match rather than losing the attribution entirely.
      if (
        !rpcError && shareCode &&
        (rpcData as Record<string, unknown> | null)?.code === "share_code_invalid"
      ) {
        ({ data: rpcData, error: rpcError } = await callRpc(null));
      }

      if (rpcError) {
        recordError = rpcError.message;
        console.error("Acquisition attribution record failed", {
          operation: "record_acquisition_attribution_v1",
          code: rpcError.code,
          message: rpcError.message,
        });
      } else {
        recorded = (rpcData as Record<string, unknown> | null) ?? null;
      }
    }

    // Debugging trail while this logic is new and unproven. The IP stored here
    // is server-derived from this request, never client-asserted; the ingest
    // path's web-landing-only gate is unchanged and still rejects claimed IPs.
    const { error: trailError } = await supabase.from("product_events").upsert(
      {
        event_id: crypto.randomUUID(),
        event_name: "acquisition_device_match_attempted",
        user_id: actor.userId,
        game_id: best?.row.game_id ?? null,
        platform: matchPlatform ?? null,
        device_type: deviceType,
        ...(rawLanguage && LANGUAGE_RE.test(rawLanguage)
          ? { device_language: rawLanguage }
          : {}),
        ...(rawResolution && SCREEN_RESOLUTION_RE.test(rawResolution.toLowerCase())
          ? { screen_resolution: rawResolution.toLowerCase() }
          : {}),
        ...(signals.ip ? { ip_address: signals.ip } : {}),
        metadata: {
          candidates_considered: candidates.length,
          matched: Boolean(best),
          match_score: best?.score ?? 0,
          confidence: best ? confidence : null,
          ip_matched: Boolean(
            best && signals.ip && String(best.row.ip_address ?? "") === signals.ip,
          ),
          matched_anonymous_id: best?.anonymousId ?? null,
          recorded: recorded?.ok === true,
          already_recorded: recorded?.already_recorded === true,
          record_error: recordError,
        },
        occurred_at: new Date().toISOString(),
      },
      { onConflict: "event_id", ignoreDuplicates: true },
    );

    if (trailError) {
      // The trail is diagnostic only; never fail the match because of it.
      console.warn("Acquisition match trail not written", trailError.message);
    }

    return jsonResponse(
      {
        ok: true,
        matched: Boolean(best),
        candidates_considered: candidates.length,
        ...(best
          ? {
            match_score: best.score,
            confidence,
            game_public_id: best.row.game_id,
            recorded: recorded?.ok === true,
          }
          : {}),
      },
      200,
      origin,
    );
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

  // Only the game-landing hop may assert a visitor IP: it is the one caller that
  // still sees the real x-forwarded-for. Everyone else's is ignored, and the IP
  // is kept to the web landing surface this attribution work is about.
  const landingSecret = Deno.env.get("LANDING_INGEST_SECRET") ?? "";
  const presentedSecret = request.headers.get("x-sportiner-landing-secret") ?? "";
  const landingTrusted = Boolean(landingSecret) &&
    secretsEqual(presentedSecret, landingSecret);

  const claimedIp = safeText(body.ip_address ?? body.ipAddress, 45);
  const ipAddress = landingTrusted && platform === "web" && claimedIp &&
      IP_RE.test(claimedIp)
    ? claimedIp
    : null;

  const context = deviceContext(body);

  // Request-level fields (anonymous_id, event_version, environment, share
  // resolution, etc.) stay in metadata; only device/network context was promoted
  // to real columns.
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
      // An untagged open from the app is organic acquisition, not absent data —
      // but only on events that describe an open. Routine in-app activity keeps
      // a null channel_hint.
      channel_hint: normalizeChannelHint(body.channelHint ?? body.channel_hint) ??
        ((platform === "ios" || platform === "android") &&
            ACQUISITION_EVENTS.has(eventName)
          ? "app"
          : null),
      ...context,
      ...(ipAddress ? { ip_address: ipAddress } : {}),
      metadata,
      occurred_at: occurredAt.toISOString(),
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
