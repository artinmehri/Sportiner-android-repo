/**
 * Request bodies are visitor-controlled. `null`, arrays, numbers and strings are
 * all valid JSON, so a successful parse does not mean we got an object — reading
 * a field off `null` would throw. Anything that is not a plain object becomes {},
 * which the caller's normal field validation then rejects with a 400.
 */
export function toJsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Parse text as a JSON object; broken JSON is treated like any other non-object. */
export function parseJsonObject(text: string): Record<string, unknown> {
  try {
    return toJsonObject(JSON.parse(text));
  } catch {
    return {};
  }
}

export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  try {
    return parseJsonObject(await req.text());
  } catch {
    return {};
  }
}
