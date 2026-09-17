import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a compact HS256 JWT. Returns the payload object or null.
 */
export function verifyHs256Jwt(
  token: string,
  secret: string,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !secret) return null;
  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null;
  }
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readJwtString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readJwtDataString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data))
    return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
