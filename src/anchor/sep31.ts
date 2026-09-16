import { randomUUID } from "node:crypto";
import { dispatchLastMile, type LastMileRail } from "./last-mile.js";
import { readJsonArray, writeJsonArray } from "./json-store.js";
import { readString, type JsonObject } from "../json.js";

const STORE = "sep31-inbound.json";

export interface Sep31Inbound {
  id: string;
  sendingAnchor: string;
  amount: string;
  asset: string;
  stellarTxHash: string;
  payoutId: string;
  lastMile: ReturnType<typeof dispatchLastMile>;
  createdAt: string;
}

export function recordSep31Inbound(input: {
  sendingAnchor: string;
  amount: string;
  stellarTxHash: string;
  phone?: string;
  rail?: LastMileRail;
}): Sep31Inbound {
  if (!input.stellarTxHash.trim()) {
    throw new Error("stellar_tx_hash is required");
  }
  const existing = readJsonArray(STORE).find(
    (row) => readString(row, "stellar_tx_hash") === input.stellarTxHash,
  );
  if (existing) {
    return {
      id: readString(existing, "id") ?? "",
      sendingAnchor: readString(existing, "sending_anchor") ?? "",
      amount: readString(existing, "amount") ?? "",
      asset: readString(existing, "asset") ?? "XOF",
      stellarTxHash: input.stellarTxHash,
      payoutId: readString(existing, "payout_id") ?? "",
      lastMile: dispatchLastMile({
        rail: input.rail ?? "wave",
        amountXof: input.amount,
        phone: input.phone ?? "+2250700000000",
        payoutId: readString(existing, "payout_id") ?? randomUUID(),
        kind: "deposit",
      }),
      createdAt: readString(existing, "created_at") ?? new Date().toISOString(),
    };
  }

  const payoutId = randomUUID();
  const lastMile = dispatchLastMile({
    rail: input.rail ?? "wave",
    amountXof: input.amount,
    phone: input.phone ?? "+2250700000000",
    payoutId,
    kind: "deposit",
  });
  const inbound: Sep31Inbound = {
    id: `sep31_${randomUUID()}`,
    sendingAnchor: input.sendingAnchor,
    amount: input.amount,
    asset: "XOF",
    stellarTxHash: input.stellarTxHash,
    payoutId,
    lastMile,
    createdAt: new Date().toISOString(),
  };
  const row: JsonObject = {
    id: inbound.id,
    sending_anchor: inbound.sendingAnchor,
    amount: inbound.amount,
    asset: inbound.asset,
    stellar_tx_hash: inbound.stellarTxHash,
    payout_id: inbound.payoutId,
    created_at: inbound.createdAt,
  };
  writeJsonArray(STORE, [...readJsonArray(STORE), row]);
  return inbound;
}
