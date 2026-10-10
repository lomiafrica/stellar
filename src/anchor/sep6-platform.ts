import {
  isJsonObject,
  parseJson,
  readString,
  type JsonObject,
  type JsonValue,
} from "../json.js";
import { assertQuoteUsable } from "./sep38.js";
import { log } from "../ops/log.js";

export type Sep6Kind = "deposit" | "withdrawal";

export interface Sep6Transaction {
  id: string;
  kind: Sep6Kind;
  status: string;
  quoteId?: string;
  amountIn?: string;
  destinationAccount?: string;
}

export type Sep6Action =
  | { method: "request_offchain_funds"; amountOut: string }
  | { method: "notify_offchain_funds_received"; amountOut: string }
  | { method: "notify_onchain_funds_sent"; amountOut: string }
  | { method: "request_onchain_funds"; amountOut: string }
  | { method: "notify_offchain_funds_sent"; amountOut: string }
  | { method: "notify_transaction_error"; amountOut: string; reason: string }
  | { method: "wait"; reason: string };

function isKind(value: string | undefined): value is Sep6Kind {
  return value === "deposit" || value === "withdrawal";
}

/** On-chain or off-chain amount taken from the honored quote, not a fresh price. */
export function quotedSettlementAmount(quoteId: string): string {
  return assertQuoteUsable(quoteId).buyAmount;
}

function amountOut(tx: Sep6Transaction): string {
  if (!tx.quoteId) return tx.amountIn ?? "0";
  return quotedSettlementAmount(tx.quoteId);
}

/**
 * Next Anchor Platform JSON-RPC call for one SEP-6 transaction.
 * An expired quote is an error, not a settlement.
 */
export function planSep6Action(tx: Sep6Transaction): Sep6Action {
  let settled = "0";
  if (tx.quoteId) {
    try {
      settled = amountOut(tx);
    } catch (err) {
      return {
        method: "notify_transaction_error",
        amountOut: "0",
        reason: err instanceof Error ? err.message : "quote rejected",
      };
    }
  } else {
    settled = tx.amountIn ?? "0";
  }

  const status = tx.status;
  if (status === "completed" || status === "error" || status === "expired") {
    return { method: "wait", reason: status };
  }

  if (tx.kind === "deposit") {
    if (status === "incomplete") {
      return { method: "request_offchain_funds", amountOut: settled };
    }
    if (
      status === "pending_user_transfer_start" ||
      status === "pending_user_transfer_complete" ||
      status === "pending_external"
    ) {
      return { method: "notify_offchain_funds_received", amountOut: settled };
    }
    if (status === "pending_anchor" || status === "pending_stellar") {
      return { method: "notify_onchain_funds_sent", amountOut: settled };
    }
    return { method: "wait", reason: status };
  }

  if (status === "incomplete" || status === "pending_anchor") {
    if (status === "incomplete") {
      return { method: "request_onchain_funds", amountOut: settled };
    }
    return { method: "notify_offchain_funds_sent", amountOut: settled };
  }
  if (
    status === "pending_user_transfer_complete" ||
    status === "pending_external" ||
    status === "pending_user"
  ) {
    return { method: "notify_offchain_funds_sent", amountOut: settled };
  }
  if (status === "pending_user_transfer_start") {
    return {
      method: "wait",
      reason: "waiting for the inbound Stellar payment",
    };
  }
  return { method: "wait", reason: status };
}

function readRecords(body: JsonValue): JsonObject[] {
  if (Array.isArray(body)) return body.filter(isJsonObject);
  if (!isJsonObject(body)) return [];
  const records = body.records ?? body.transactions;
  if (!Array.isArray(records)) return [];
  return records.filter(isJsonObject);
}

export function parseSep6Transaction(
  row: JsonObject,
): Sep6Transaction | undefined {
  const id = readString(row, "id") ?? "";
  if (!id) return undefined;
  const kindRaw = readString(row, "kind") ?? readString(row, "type");
  if (kindRaw && !isKind(kindRaw) && kindRaw !== "withdraw") return undefined;
  return {
    id,
    kind: kindRaw === "deposit" ? "deposit" : "withdrawal",
    status: readString(row, "status") ?? "incomplete",
    quoteId: readString(row, "quote_id"),
    amountIn:
      readString(row, "amount_in") ??
      readString(row, "amount_expected") ??
      undefined,
    destinationAccount: readString(row, "destination_account"),
  };
}

export function parseSep6List(body: JsonValue): Sep6Transaction[] {
  const out: Sep6Transaction[] = [];
  for (const row of readRecords(body)) {
    const tx = parseSep6Transaction(row);
    if (tx) out.push(tx);
  }
  return out;
}

export interface Sep6DriveDeps {
  list: () => Promise<Sep6Transaction[]>;
  rpc: (
    method: string,
    params: JsonObject,
  ) => Promise<{ ok: boolean; detail: string }>;
  sendEnabled?: boolean;
}

export async function driveSep6Once(
  deps: Sep6DriveDeps,
): Promise<{ advanced: string[]; skipped: string[] }> {
  const advanced: string[] = [];
  const skipped: string[] = [];
  const rows = await deps.list();
  for (const tx of rows) {
    const action = planSep6Action(tx);
    if (action.method === "wait") {
      skipped.push(tx.id);
      continue;
    }
    if (
      action.method === "notify_onchain_funds_sent" &&
      deps.sendEnabled !== true
    ) {
      log("tx.submitted", {
        payout_id: tx.id,
        skipped: true,
        reason: "SEP6_DRIVE_SEND unset",
      });
      skipped.push(tx.id);
      continue;
    }
    const params: JsonObject = {
      transaction_id: tx.id,
      message: action.method,
      amount_out: action.amountOut,
    };
    if (action.method === "notify_transaction_error") {
      params.message = action.reason;
    }
    const result = await deps.rpc(action.method, params);
    log(result.ok ? "tx.confirmed" : "tx.send_error", {
      payout_id: tx.id,
      method: action.method,
      detail: result.detail,
    });
    if (result.ok) advanced.push(tx.id);
    else skipped.push(tx.id);
  }
  return { advanced, skipped };
}

function platformBase(): string {
  return (process.env.PLATFORM_API_URL ?? "").replace(/\/$/, "");
}

type PlatformHeaders = {
  "Content-Type": string;
  "X-Api-Key"?: string;
};

function platformHeaders(): PlatformHeaders {
  const headers: PlatformHeaders = {
    "Content-Type": "application/json",
  };
  const secret = process.env.CALLBACK_AUTH_SECRET?.trim() ?? "";
  if (secret) headers["X-Api-Key"] = secret;
  return headers;
}

export async function listPlatformSep6(): Promise<Sep6Transaction[]> {
  const base = platformBase();
  if (!base) return [];
  const response = await fetch(`${base}/transactions?sep=6`, {
    headers: platformHeaders(),
  });
  const text = await response.text();
  if (!response.ok) {
    log("tx.send_error", {
      detail: `${response.status} ${text.slice(0, 180)}`,
    });
    return [];
  }
  try {
    return parseSep6List(parseJson(text));
  } catch {
    return [];
  }
}

export async function platformRpc(
  method: string,
  params: JsonObject,
): Promise<{ ok: boolean; detail: string }> {
  const base = platformBase();
  if (!base) return { ok: false, detail: "PLATFORM_API_URL unset" };
  try {
    const response = await fetch(`${base}/rpc`, {
      method: "POST",
      headers: platformHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: method,
        method,
        params,
      }),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      detail: `${response.status} ${text.slice(0, 200)}`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "rpc failed",
    };
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startSep6Schedule(): void {
  if (timer) return;
  if (!platformBase()) return;
  const seconds = Number(process.env.SEP6_POLL_SECONDS ?? "60");
  const span = (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
  const tick = () => {
    void driveSep6Once({
      list: listPlatformSep6,
      rpc: platformRpc,
      sendEnabled: process.env.SEP6_DRIVE_SEND === "1",
    }).catch((err) => {
      log("tx.send_error", {
        message: err instanceof Error ? err.message : "sep6 drive failed",
      });
    });
  };
  timer = setInterval(tick, span);
  timer.unref?.();
}
