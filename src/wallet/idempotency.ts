import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isJsonObject,
  parseJson,
  readString,
  type JsonObject,
} from "../json.js";
import { withNamedLock } from "../ledger/lock.js";
import { getDataDir } from "../paths.js";

type IdempotencyState = "in_flight" | "done";

type IdempotencyRow = {
  key: string;
  state: IdempotencyState;
  body: JsonObject;
  createdAt: string;
};

function filePath(): string {
  return join(getDataDir(), "wallet_idempotency.json");
}

function readRows(): IdempotencyRow[] {
  const path = filePath();
  if (!existsSync(path)) return [];
  const parsed = parseJson(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) return [];
  const rows: IdempotencyRow[] = [];
  for (const item of parsed) {
    if (!isJsonObject(item)) continue;
    const key = readString(item, "key");
    const state = readString(item, "state");
    const createdAt = readString(item, "createdAt");
    const body = item.body;
    if (!key || !createdAt || !isJsonObject(body)) continue;
    if (state !== "in_flight" && state !== "done") continue;
    rows.push({ key, state, body, createdAt });
  }
  return rows;
}

function writeRows(rows: IdempotencyRow[]): void {
  const dir = getDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath(), `${JSON.stringify(rows, null, 2)}\n`);
}

const IN_FLIGHT_MS = 180_000;

export type WalletIdempotencyBegin =
  | { kind: "fresh" }
  | { kind: "busy" }
  | { kind: "hit"; body: JsonObject };

export function beginWalletIdempotency(key: string): WalletIdempotencyBegin {
  return withNamedLock("wallet-idempotency", () => beginUnlocked(key));
}

function beginUnlocked(key: string): WalletIdempotencyBegin {
  const rows = readRows();
  const existing = rows.find((row) => row.key === key);
  if (existing?.state === "done") return { kind: "hit", body: existing.body };
  if (existing?.state === "in_flight") {
    const age = Date.now() - Date.parse(existing.createdAt);
    if (Number.isFinite(age) && age < IN_FLIGHT_MS) return { kind: "busy" };
  }
  const next: IdempotencyRow = {
    key,
    state: "in_flight",
    body: {},
    createdAt: new Date().toISOString(),
  };
  writeRows([...rows.filter((row) => row.key !== key), next]);
  return { kind: "fresh" };
}

export function saveWalletIdempotency(key: string, body: JsonObject): void {
  withNamedLock("wallet-idempotency", () => {
    saveUnlocked(key, body);
  });
}

export function cancelWalletIdempotency(key: string): void {
  withNamedLock("wallet-idempotency", () => {
    writeRows(
      readRows().filter((row) => !(row.key === key && row.state === "in_flight")),
    );
  });
}

function saveUnlocked(key: string, body: JsonObject): void {
  const rows = readRows().filter((row) => row.key !== key);
  rows.push({
    key,
    state: "done",
    body,
    createdAt: new Date().toISOString(),
  });
  writeRows(rows);
}
