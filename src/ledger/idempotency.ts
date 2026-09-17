import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isJsonObject,
  parseJson,
  readString,
  type JsonObject,
} from "../json.js";
import { getDataDir } from "../paths.js";
import type { CreateStellarPayoutResponse } from "../payouts/types.js";
import { withNamedLock } from "./lock.js";
import type { PayoutStatus } from "./store.js";

function idempotencyPath(): string {
  return join(getDataDir(), "demo_idempotency.json");
}

interface IdempotencyEntry {
  idempotency_key: string;
  payout_id: string;
  response: CreateStellarPayoutResponse;
  created_at: string;
  state: "in_flight" | "done";
}

function ensureDataDir(): void {
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function readStatus(value: string | undefined): PayoutStatus {
  if (
    value === "pending" ||
    value === "processing" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }
  return "failed";
}

function readCachedResponse(row: JsonObject): CreateStellarPayoutResponse {
  const kind =
    readString(row, "kind") === "beneficiary" ? "beneficiary" : "withdrawal";
  return {
    success: row.success === true,
    payout_id: readString(row, "payout_id") ?? "",
    kind,
    status: readStatus(readString(row, "status")),
    message: readString(row, "message"),
    stellar_tx_hash: readString(row, "stellar_tx_hash"),
    explorer_tx: readString(row, "explorer_tx"),
    explorer_account_omnibus: readString(row, "explorer_account_omnibus"),
    explorer_account_merchant: readString(row, "explorer_account_merchant"),
    bridge_transfer_id: readString(row, "bridge_transfer_id"),
  };
}

function readAll(): IdempotencyEntry[] {
  ensureDataDir();
  const path = idempotencyPath();
  if (!existsSync(path)) return [];
  const parsed = parseJson(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isJsonObject).map((row) => {
    const responseValue = row.response;
    const response = isJsonObject(responseValue)
      ? readCachedResponse(responseValue)
      : readCachedResponse(row);
    return {
      idempotency_key: readString(row, "idempotency_key") ?? "",
      payout_id: readString(row, "payout_id") ?? response.payout_id,
      response,
      created_at: readString(row, "created_at") ?? "",
      state: readString(row, "state") === "in_flight" ? "in_flight" : "done",
    };
  });
}

function writeAll(rows: IdempotencyEntry[]): void {
  ensureDataDir();
  writeFileSync(idempotencyPath(), `${JSON.stringify(rows, null, 2)}\n`);
}

const IN_FLIGHT_MS = 180_000;

export type IdempotencyBegin =
  | { kind: "hit"; response: CreateStellarPayoutResponse }
  | { kind: "busy" }
  | { kind: "fresh" };

export function getIdempotentResponse(
  idempotencyKey: string,
): CreateStellarPayoutResponse | undefined {
  const cached = readAll().find(
    (e) => e.idempotency_key === idempotencyKey && e.state === "done",
  );
  return cached?.response;
}

/** Record the key as in_flight before work so a second caller cannot start a second hop. */
export function beginIdempotency(idempotencyKey: string): IdempotencyBegin {
  return withNamedLock("idempotency", () => {
    const rows = readAll();
    const existing = rows.find((e) => e.idempotency_key === idempotencyKey);
    if (existing?.state === "done") {
      return { kind: "hit", response: existing.response };
    }
    if (existing?.state === "in_flight") {
      const age = Date.now() - Date.parse(existing.created_at);
      if (Number.isFinite(age) && age < IN_FLIGHT_MS) {
        return { kind: "busy" };
      }
    }
    const next: IdempotencyEntry = {
      idempotency_key: idempotencyKey,
      payout_id: "",
      response: {
        success: false,
        payout_id: "",
        kind: "withdrawal",
        status: "processing",
      },
      created_at: new Date().toISOString(),
      state: "in_flight",
    };
    writeAll([
      ...rows.filter((e) => e.idempotency_key !== idempotencyKey),
      next,
    ]);
    return { kind: "fresh" };
  });
}

export function saveIdempotentResponse(
  idempotencyKey: string,
  payoutId: string,
  response: CreateStellarPayoutResponse,
): void {
  withNamedLock("idempotency", () => {
    const rows = readAll().filter((e) => e.idempotency_key !== idempotencyKey);
    rows.push({
      idempotency_key: idempotencyKey,
      payout_id: payoutId,
      response,
      created_at: new Date().toISOString(),
      state: "done",
    });
    writeAll(rows);
  });
}
