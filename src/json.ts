/** JSON primitives (no bigint/undefined). */
export type JsonPrimitive = string | number | boolean | null;

/** Recursive JSON value. */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

/** JSON object with JsonValue entries. */
export type JsonObject = { [key: string]: JsonValue };

function isString<Value>(value: Value): value is Value & string {
  return typeof value === "string";
}

function isNumber<Value>(value: Value): value is Value & number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean<Value>(value: Value): value is Value & boolean {
  return typeof value === "boolean";
}

function isBigint<Value>(value: Value): value is Value & bigint {
  return typeof value === "bigint";
}

function isSymbol<Value>(value: Value): value is Value & symbol {
  return typeof value === "symbol";
}

type Callable = (...args: never[]) => void;

function isFunction<T>(value: T): value is Extract<T, Callable> {
  return typeof value === "function";
}

/** True when value is a plain JSON object (not an array). */
export function isJsonObject<Value>(value: Value): value is Value & JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively validate a JSON value; throws on non-JSON shapes.
 * Accepts unknown at the I/O boundary (JSON.parse).
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- I/O boundary: JSON.parse
export function validateJsonValue(value: unknown): JsonValue {
  if (value === undefined) {
    throw new TypeError("Top-level JSON value cannot be undefined");
  }
  if (value === null) return null;
  if (isString(value)) return value;
  if (isNumber(value)) return value;
  if (isBoolean(value)) return value;
  if (isBigint(value) || isSymbol(value) || isFunction(value)) {
    throw new TypeError("Value is not JSON-serializable");
  }
  if (Array.isArray(value)) {
    return value.map((item) => validateJsonValue(item));
  }
  if (isJsonObject(value)) {
    const out: JsonObject = {};
    for (const key of Object.keys(value)) {
      const entry = value[key];
      if (entry === undefined) continue;
      out[key] = validateJsonValue(entry);
    }
    return out;
  }
  throw new TypeError("Value is not JSON-serializable");
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
  return isString(value) ? value : undefined;
}

/** Read a number field from a JsonObject, or undefined if missing/wrong type. */
export function readNumber(
  object: JsonObject,
  key: string,
): number | undefined {
  const value = object[key];
  return isNumber(value) ? value : undefined;
}
