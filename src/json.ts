/** JSON primitives (no bigint/undefined). */
export type JsonPrimitive = string | number | boolean | null;

/** Recursive JSON value. */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

/** JSON object with JsonValue entries. */
export type JsonObject = { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when value is a plain JSON object (not an array). */
export function isJsonObject<Value>(
  value: Value,
): value is Value & JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateJsonValue(value: unknown): JsonValue {
  if (value === undefined) {
    throw new TypeError('Top-level JSON value cannot be undefined');
  }
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  if (
    typeof value === 'bigint' ||
    typeof value === 'symbol' ||
    typeof value === 'function'
  ) {
    throw new TypeError('Value is not JSON-serializable');
  }
  if (Array.isArray(value)) {
    return value.map((item) => validateJsonValue(item));
  }
  if (isPlainObject(value)) {
    const out: JsonObject = {};
    for (const key of Object.keys(value)) {
      const entry = value[key];
      if (entry === undefined) continue;
      out[key] = validateJsonValue(entry);
    }
    return out;
  }
  throw new TypeError('Value is not JSON-serializable');
}

/** Parse JSON text into JsonValue. */
export function parseJson(text: string): JsonValue {
  return validateJsonValue(JSON.parse(text));
}

/** Read a string field from a JsonObject, or undefined if missing/wrong type. */
export function readString(
  object: JsonObject,
  key: string,
): string | undefined {
  const value = object[key];
  return typeof value === 'string' ? value : undefined;
}

/** Read a number field from a JsonObject, or undefined if missing/wrong type. */
export function readNumber(
  object: JsonObject,
  key: string,
): number | undefined {
  const value = object[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
