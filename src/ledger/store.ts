import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isJsonObject,
  parseJson,
  readNumber,
  readString,
  type JsonObject,
  type JsonValue,
} from "../json.js";
import { getDataDir } from "../paths.js";
import { withNamedLock } from "./lock.js";

/** Mirrors prod `payouts.status` */
export type PayoutStatus = "pending" | "processing" | "completed" | "failed";

export type LastMileRail = "wave" | "mtn" | "spi" | "bank";
export type PayoutDestination = "self" | "beneficiary";
export type LomiEnvironment = "test" | "live";

/**
 * Local shadow of the proposed `stellar_settlements` table + `payouts` join keys.
 * Persisted as snake_case JSON in `data/stellar_settlements.json`.
 */
export interface StellarSettlementRecord {
  id: string;
  organization_id: string;
  environment: LomiEnvironment;
  payout_id: string;
  destination: PayoutDestination;
  last_mile_rail: LastMileRail;
  amount: number;
  currency_code: string;
  amount_usdc: string;
  stellar_tx_hash?: string;
  stellar_from?: string;
  stellar_to?: string;
  bridge_transfer_id?: string;
  memo: string;
  status: PayoutStatus;
  created_at: string;
  updated_at: string;
  mock_offramp?: {
    rail: string;
    phone?: string;
    status: string;
  };
}

function ledgerPath(): string {
  return join(getDataDir(), "stellar_settlements.json");
}

function legacyLedgerPath(): string {
  return join(getDataDir(), "settlements.json");
}

function ensureDataDir(): void {
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function normalizeLegacyRow(raw: JsonObject): StellarSettlementRecord {
  const payoutId = firstString(raw, "payout_id", "payoutId") ?? "";
  const now = new Date().toISOString();
  return {
    id: readString(raw, "id") ?? payoutId,
    organization_id:
      readString(raw, "organization_id") ??
      "00000000-0000-4000-8000-000000000001",
    environment: readString(raw, "environment") === "live" ? "live" : "test",
    payout_id: payoutId,
    destination: readDestination(raw["destination"]),
    last_mile_rail: readLastMileRail(raw["last_mile_rail"]),
    amount: firstNumber(raw, "amount", "amountUsdc") ?? 0,
    currency_code: readString(raw, "currency_code") ?? "USD",
    amount_usdc: firstString(raw, "amount_usdc", "amountUsdc") ?? "0",
    stellar_tx_hash: firstString(raw, "stellar_tx_hash", "stellarTxHash"),
    stellar_from: firstString(raw, "stellar_from", "from"),
    stellar_to: firstString(raw, "stellar_to", "to"),
    bridge_transfer_id: firstString(
      raw,
      "bridge_transfer_id",
      "bridgeTransferId",
    ),
    memo: readString(raw, "memo") ?? payoutId.slice(0, 28),
    status: mapLegacyStatus(raw.status),
    created_at: firstString(raw, "created_at", "createdAt") ?? now,
    updated_at: firstString(raw, "updated_at", "updatedAt") ?? now,
    mock_offramp: readMockOfframp(raw["mock_offramp"] ?? raw["mockOfframp"]),
  };
}

function mapLegacyStatus(status: JsonValue | undefined): PayoutStatus {
  if (status === "confirmed") return "completed";
  if (
    status === "pending" ||
    status === "processing" ||
    status === "completed" ||
    status === "failed"
  ) {
    return status;
  }
  return "completed";
}

function firstString(
  object: JsonObject,
  firstKey: string,
  secondKey: string,
): string | undefined {
  return readString(object, firstKey) ?? readString(object, secondKey);
}

function firstNumber(
  object: JsonObject,
  firstKey: string,
  secondKey: string,
): number | undefined {
  const direct = readNumber(object, firstKey);
  if (direct !== undefined) return direct;
  const alternate = object[secondKey];
  if (alternate === undefined) return undefined;
  const converted = Number(alternate);
  return Number.isFinite(converted) ? converted : undefined;
}

function readDestination(value: JsonValue | undefined): PayoutDestination {
  return value === "beneficiary" ? "beneficiary" : "self";
}

function readLastMileRail(value: JsonValue | undefined): LastMileRail {
  if (value === "mtn" || value === "spi" || value === "bank") return value;
  return "wave";
}

function readMockOfframp(
  value: JsonValue | undefined,
): StellarSettlementRecord["mock_offramp"] {
  if (value === undefined || !isJsonObject(value)) return undefined;
  return {
    rail: readString(value, "rail") ?? "wave",
    phone: readString(value, "phone"),
    status: readString(value, "status") ?? "pending",
  };
}

function readRawLedger(): StellarSettlementRecord[] {
  ensureDataDir();
  const current = ledgerPath();
  const legacy = legacyLedgerPath();
  const path = existsSync(current)
    ? current
    : existsSync(legacy)
      ? legacy
      : current;
  if (!existsSync(path)) {
    return [];
  }
  const raw = readFileSync(path, "utf8");
  const parsed = parseJson(raw);
  const rows = Array.isArray(parsed)
    ? parsed
    : isJsonObject(parsed) && Array.isArray(parsed["settlements"])
      ? parsed["settlements"]
      : [];
  return rows.filter(isJsonObject).map(normalizeLegacyRow);
}

export function readLedger(): StellarSettlementRecord[] {
  return readRawLedger();
}

function writeRawLedger(rows: StellarSettlementRecord[]): void {
  ensureDataDir();
  writeFileSync(ledgerPath(), `${JSON.stringify(rows, null, 2)}\n`);
}

export function writeLedger(rows: StellarSettlementRecord[]): void {
  withNamedLock("ledger", () => {
    writeRawLedger(rows);
  });
}

/** Drop phones before HTML or JSON demo pages. */
export function publicSettlement(
  row: StellarSettlementRecord,
): StellarSettlementRecord {
  if (!row.mock_offramp) return row;
  return {
    ...row,
    mock_offramp: {
      rail: row.mock_offramp.rail,
      status: row.mock_offramp.status,
    },
  };
}

export type ClaimOutcome =
  | { kind: "replay"; record: StellarSettlementRecord }
  | { kind: "recover"; record: StellarSettlementRecord }
  | { kind: "busy"; record: StellarSettlementRecord }
  | { kind: "claimed"; record: StellarSettlementRecord };

const CLAIM_STALE_MS = 180_000;

/**
 * Atomically mark a payout processing before sign/submit.
 * A second caller gets replay, recover, or busy instead of a second Payment.
 */
export function claimPayout(draft: StellarSettlementRecord): ClaimOutcome {
  return withNamedLock("ledger", () => {
    const rows = readRawLedger();
    const idx = rows.findIndex((row) => row.payout_id === draft.payout_id);
    const existing = idx >= 0 ? rows[idx] : undefined;
    if (existing?.stellar_tx_hash && existing.status === "completed") {
      return { kind: "replay", record: existing };
    }
    if (existing?.status === "processing") {
      if (existing.stellar_tx_hash) {
        return { kind: "recover", record: existing };
      }
      const created = Date.parse(existing.updated_at || existing.created_at);
      const stale =
        Number.isFinite(created) && Date.now() - created > CLAIM_STALE_MS;
      if (!stale) {
        return { kind: "busy", record: existing };
      }
    }
    const now = new Date().toISOString();
    const next: StellarSettlementRecord = {
      ...draft,
      id: existing?.id ?? draft.id,
      created_at: existing?.created_at ?? draft.created_at,
      status: "processing",
      stellar_tx_hash: undefined,
      updated_at: now,
    };
    if (idx >= 0) rows[idx] = next;
    else rows.push(next);
    writeRawLedger(rows);
    return { kind: "claimed", record: next };
  });
}

const DEFAULT_TTL_DAYS = 14;

/** Drop settlement rows older than STELLAR_DATA_TTL_DAYS (default 14). */
export function purgeExpiredSettlements(
  now = Date.now(),
  ttlDays = Number(process.env.STELLAR_DATA_TTL_DAYS ?? DEFAULT_TTL_DAYS),
): number {
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) return 0;
  const cutoff = now - ttlDays * 24 * 60 * 60 * 1000;
  return withNamedLock("ledger", () => {
    const rows = readRawLedger();
    const kept = rows.filter((row) => {
      const created = Date.parse(row.created_at);
      return !Number.isFinite(created) || created >= cutoff;
    });
    const dropped = rows.length - kept.length;
    if (dropped > 0) writeRawLedger(kept);
    return dropped;
  });
}

export function findByPayoutId(
  payoutId: string,
): StellarSettlementRecord | undefined {
  return readLedger().find((r) => r.payout_id === payoutId);
}

export function findByTxHash(
  hash: string,
): StellarSettlementRecord | undefined {
  return readLedger().find((r) => r.stellar_tx_hash === hash);
}

export function upsertSettlement(
  record: StellarSettlementRecord,
): StellarSettlementRecord {
  return withNamedLock("ledger", () => {
    const rows = readRawLedger();
    const idx = rows.findIndex((r) => r.payout_id === record.payout_id);
    const next = { ...record, updated_at: new Date().toISOString() };
    if (idx >= 0) {
      rows[idx] = next;
    } else {
      rows.push(next);
    }
    writeRawLedger(rows);
    return next;
  });
}

export function patchSettlement(
  payoutId: string,
  patch: Partial<StellarSettlementRecord>,
): StellarSettlementRecord | undefined {
  const existing = findByPayoutId(payoutId);
  if (!existing) return undefined;
  return upsertSettlement({
    ...existing,
    ...patch,
    payout_id: payoutId,
    updated_at: new Date().toISOString(),
  });
}

export function getLedgerPath(): string {
  return ledgerPath();
}

/** @deprecated use StellarSettlementRecord */
export type SettlementRecord = StellarSettlementRecord;
