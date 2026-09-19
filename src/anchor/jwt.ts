import { createHmac, timingSafeEqual } from "node:crypto";
import {
  isJsonObject,
  parseJson,
  readString,
  type JsonObject,
} from "../json.js";

/**
 * Verify a compact HS256 JWT. Returns the payload object or null.
 */
export function verifyHs256Jwt(
  token: string,
  secret: string,
): JsonObject | null {
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
    const parsed = parseJson(json);
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readJwtString(
  payload: JsonObject,
  key: string,
): string | undefined {
  const value = readString(payload, key);
  return value && value.length > 0 ? value : undefined;
}

export function readJwtDataString(
  payload: JsonObject,
  key: string,
): string | undefined {
  const data = payload.data;
  if (!isJsonObject(data)) return undefined;
  const value = readString(data, key);
  return value && value.length > 0 ? value : undefined;
}
