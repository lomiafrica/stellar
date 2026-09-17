import { readString, type JsonObject } from "../json.js";
import { readJsonArray, writeJsonArray } from "./json-store.js";

export type LastMileRail = "wave" | "mtn" | "spi";

export interface LastMileRequest {
  rail: LastMileRail;
  amountXof: string;
  phone: string;
  payoutId: string;
  kind: "deposit" | "withdraw";
}

export interface LastMileResult {
  rail: LastMileRail;
  amountXof: string;
  phone: string;
  payoutId: string;
  kind: "deposit" | "withdraw";
  status: "accepted" | "sandbox";
  message: string;
  createdAt: string;
}

const STORE = "last-mile.json";
const memory = new Map<string, LastMileResult>();

function persist(result: LastMileResult): void {
  memory.set(result.payoutId, result);
  const rows = readJsonArray(STORE);
  const next: JsonObject = {
    rail: result.rail,
    amount_xof: result.amountXof,
    phone: result.phone,
    payout_id: result.payoutId,
    kind: result.kind,
    status: result.status,
    message: result.message,
    created_at: result.createdAt,
  };
  rows.push(next);
  writeJsonArray(STORE, rows);
}

export function listLastMileCredits(payoutId?: string): JsonObject[] {
  const rows = readJsonArray(STORE);
  if (!payoutId) return rows;
  return rows.filter((row) => readString(row, "payout_id") === payoutId);
}

/** Latest sandbox credit for a SEP-24 / last-mile id (memory, then file). */
export function getLastMileCredit(
  payoutId: string,
): LastMileResult | undefined {
  const hit = memory.get(payoutId);
  if (hit) return hit;
  const rows = listLastMileCredits(payoutId);
  const row = rows[rows.length - 1];
  if (!row) return undefined;
  const rail = readString(row, "rail");
  const kind = readString(row, "kind");
  return {
    rail: rail === "mtn" || rail === "spi" ? rail : "wave",
    amountXof: readString(row, "amount_xof") ?? "",
    phone: readString(row, "phone") ?? "",
    payoutId: readString(row, "payout_id") ?? payoutId,
    kind: kind === "deposit" ? "deposit" : "withdraw",
    status: "sandbox",
    message: readString(row, "message") ?? "",
    createdAt: readString(row, "created_at") ?? "",
  };
}

export function dispatchLastMile(input: LastMileRequest): LastMileResult {
  const rail: LastMileRail =
    input.rail === "mtn" || input.rail === "spi" ? input.rail : "wave";
  const result: LastMileResult = {
    rail,
    amountXof: input.amountXof,
    phone: input.phone,
    payoutId: input.payoutId,
    kind: input.kind,
    status: "sandbox",
    message: `Sandbox ${rail} ${input.kind}. No live mobile money. Same adapter shape as the production ${rail} rail.`,
    createdAt: new Date().toISOString(),
  };
  persist(result);
  return result;
}
