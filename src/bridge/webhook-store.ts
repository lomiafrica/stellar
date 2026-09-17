import { readString, type JsonObject } from "../json.js";
import { withNamedLock } from "../ledger/lock.js";
import { readJsonArray, writeJsonArray } from "../anchor/json-store.js";

const STORE = "bridge_events.json";

export function hasBridgeEvent(eventId: string): boolean {
  return readJsonArray(STORE).some((row) => readString(row, "id") === eventId);
}

/** Insert-or-reject. Returns false when the event id is already stored. */
export function tryRecordBridgeEvent(
  eventId: string,
  now = new Date().toISOString(),
): boolean {
  return withNamedLock("bridge", () => {
    const rows = readJsonArray(STORE);
    if (rows.some((row) => readString(row, "id") === eventId)) return false;
    const next: JsonObject = { id: eventId, seen_at: now };
    rows.push(next);
    writeJsonArray(STORE, rows);
    return true;
  });
}

export function recordBridgeEvent(
  eventId: string,
  now = new Date().toISOString(),
): void {
  tryRecordBridgeEvent(eventId, now);
}
