import type { JsonObject } from "../json.js";

/** One JSON line on stdout. Callers pass short event names. */
export function log(event: string, fields: JsonObject = {}): void {
  const line: JsonObject = {
    ts: new Date().toISOString(),
    event,
    ...fields,
  };
  console.log(JSON.stringify(line));
}
