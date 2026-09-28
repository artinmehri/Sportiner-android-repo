/**
 * Device/network context for product_events' real columns. Shared by game-landing
 * (which collects it from the browser) and product-event (which writes it).
 *
 * Every field is best-effort browser data, so anything unrecognised is dropped
 * instead of failing the event. The DB check constraints on device_type and
 * connection_type cover the same vocabularies.
 */

export const DEVICE_TYPES = new Set(["mobile", "tablet", "desktop", "unknown"]);
export const CONNECTION_TYPES = new Set(["slow-2g", "2g", "3g", "4g", "unknown"]);
export const SCREEN_RESOLUTION_RE = /^\d{1,5}x\d{1,5}$/;
export const LANGUAGE_RE = /^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8}){0,4}$/;

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/** Accepts snake_case and camelCase field names; returns only the fields that pass. */
export function deviceContext(body: Record<string, unknown>): Record<string, string> {
  const context: Record<string, string> = {};

  const deviceType = text(body.device_type ?? body.deviceType, 32)?.toLowerCase();
  if (deviceType && DEVICE_TYPES.has(deviceType)) context.device_type = deviceType;

  const connectionType = text(body.connection_type ?? body.connectionType, 32)?.toLowerCase();
  if (connectionType && CONNECTION_TYPES.has(connectionType)) {
    context.connection_type = connectionType;
  }

  const resolution = text(body.screen_resolution ?? body.screenResolution, 16)?.toLowerCase();
  if (resolution && SCREEN_RESOLUTION_RE.test(resolution)) {
    context.screen_resolution = resolution;
  }

  const language = text(body.device_language ?? body.deviceLanguage, 35);
  if (language && LANGUAGE_RE.test(language)) context.device_language = language;

  return context;
}
