/**
 * SPO-247 Section 13 event registry.
 * Authoritative allowlist + per-event property validation.
 */

export type AuthMode = "anonymous" | "authenticated" | "either" | "server_only";

export type EventDefinition = {
  name: string;
  auth: AuthMode;
  /** Property keys allowed in `properties` / legacy metadata. */
  allowedProperties: readonly string[];
  requiredProperties?: readonly string[];
};

/** Only events with current production senders belong in this registry. */
const ACTIVE_EVENTS: EventDefinition[] = [
  {
    name: "game_link_opened",
    auth: "either",
    allowedProperties: [
      "entry_surface",
      "referrer_host",
      "game_public_id",
      "user_agent_class",
      "channel_code",
      "share_code_present",
      "resolution_state",
    ],
  },
  {
    name: "shared_game_landing_viewed",
    auth: "anonymous",
    allowedProperties: [
      "game_state",
      "user_agent_class",
      "game_public_id",
      "channel_code",
      "share_code_present",
    ],
  },
  {
    name: "app_store_redirect_started",
    auth: "anonymous",
    allowedProperties: [
      "handoff_method",
      "game_public_id",
      "user_agent_class",
      "channel_code",
      "share_code_present",
    ],
  },
  {
    name: "game_viewed",
    auth: "either",
    allowedProperties: ["game_public_id", "view_surface"],
    requiredProperties: ["game_public_id"],
  },
  {
    name: "game_created",
    auth: "server_only",
    allowedProperties: ["result", "public_id", "capacity", "type"],
  },
  {
    name: "game_joined",
    auth: "server_only",
    allowedProperties: ["result", "public_id", "game_player_id", "players_enrolled"],
  },
  {
    name: "game_completed",
    auth: "server_only",
    allowedProperties: [
      "participant_count",
      "completion_basis",
      "effective_end_time",
      "backfill",
      "end_time_basis",
    ],
  },
  {
    name: "onboarding_started",
    auth: "server_only",
    allowedProperties: ["onboarding_version"],
  },
  {
    name: "onboarding_step_completed",
    auth: "server_only",
    allowedProperties: ["stage", "onboarding_version"],
    requiredProperties: ["stage"],
  },
  {
    name: "onboarding_completed",
    auth: "server_only",
    allowedProperties: ["onboarding_version"],
  },
];

export const EVENT_REGISTRY: Map<string, EventDefinition> = new Map(
  ACTIVE_EVENTS.map((def) => [def.name, def]),
);

export const MAX_BODY_BYTES = 8_192;
export const MAX_PROPERTIES = 24;
export const MAX_PROPERTY_STRING = 200;
export const CLOCK_SKEW_MS = 10 * 60 * 1000;

export const FORBIDDEN_PROPERTY_KEYS = new Set([
  "user_id",
  "host_id",
  "hostId",
  "email",
  "user_email",
  "latitude",
  "longitude",
  "lat",
  "lon",
  "coords",
  "location_cords",
  "exact_location",
  "message",
  "message_text",
  "chat_id",
  "password",
  "token",
  "idfa",
  "advertising_id",
  "ip",
  "raw_ip",
]);

export const ALLOWED_ENVIRONMENTS = new Set(["development", "preview", "production"]);
export const ALLOWED_PLATFORMS = new Set(["ios", "android", "web", "server"]);

export function getEventDefinition(name: string): EventDefinition | null {
  return EVENT_REGISTRY.get(name) ?? null;
}
