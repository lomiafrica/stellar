import { readString, type JsonObject } from "../json.js";
import { readJsonArray, writeJsonArray } from "../anchor/json-store.js";

const STORE = "bridge_events.json";

export function hasBridgeEvent(eventId: string): boolean {
  return readJsonArray(STORE).some((row) => readString(row, "id") === eventId);
}

export function recordBridgeEvent(eventId: string, now = new Date().toISOString()): void {
  const rows = readJsonArray(STORE);
  if (rows.some((row) => readString(row, "id") === eventId)) return;
  const next: JsonObject = { id: eventId, seen_at: now };
  rows.push(next);
  writeJsonArray(STORE, rows);
}
