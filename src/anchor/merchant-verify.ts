import {
  isJsonObject,
  parseJson,
  readString,
  type JsonObject,
} from "../json.js";
import { readJsonArray, writeJsonArray } from "./json-store.js";

export type Sep12Status = "ACCEPTED" | "PROCESSING" | "NEEDS_INFO" | "REJECTED";

export interface Sep12Customer {
  id: string;
  account?: string;
  status: Sep12Status;
  message: string;
  type: string;
  fields?: Record<string, string>;
}

const STORE = "sep12-customers.json";

function acceptedAccounts(): Set<string> {
  const raw = process.env.SEP12_ACCEPTED_ACCOUNTS?.trim() ?? "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

function localLookup(account: string | undefined): Sep12Customer | undefined {
  if (!account) return undefined;
  const rows = readJsonArray(STORE);
  const match = rows.find((row) => readString(row, "account") === account);
  if (!match) return undefined;
  const status = readString(match, "status");
  return {
    id: readString(match, "id") ?? account,
    account,
    status:
      status === "ACCEPTED" ||
      status === "PROCESSING" ||
      status === "NEEDS_INFO" ||
      status === "REJECTED"
        ? status
        : "NEEDS_INFO",
    message: readString(match, "message") ?? "Stored SEP-12 customer.",
    type: readString(match, "type") ?? "sep24",
  };
}

function isTestnetKyc(): boolean {
  const raw = (process.env.STELLAR_NETWORK ?? "testnet").trim().toLowerCase();
  return raw !== "public" && raw !== "mainnet";
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Read email from a SEP-12 / Callback API PUT body. */
export function readSep12PutEmail(body: {
  email?: string;
  email_address?: string;
  fields?: Record<string, unknown>;
}): string | undefined {
  const direct = body.email?.trim() || body.email_address?.trim();
  if (direct) return direct;
  const fields = body.fields;
  if (!fields || typeof fields !== "object") return undefined;
  const nested = fields.email ?? fields.email_address;
  return typeof nested === "string" && nested.trim()
    ? nested.trim()
    : undefined;
}

function persist(customer: Sep12Customer): void {
  const rows = readJsonArray(STORE).filter(
    (row) => readString(row, "account") !== customer.account,
  );
  const next: JsonObject = {
    id: customer.id,
    account: customer.account ?? "",
    status: customer.status,
    message: customer.message,
    type: customer.type,
  };
  rows.push(next);
  writeJsonArray(STORE, rows);
}

async function callMerchantVerification(
  account: string,
  type: string,
): Promise<Sep12Customer | null> {
  const url = process.env.LOMI_MERCHANT_VERIFY_URL?.trim();
  if (!url) return null;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, type }),
  });
  const raw = parseJson(await response.text());
  if (!isJsonObject(raw)) {
    return {
      id: account,
      account,
      status: "PROCESSING",
      message: "Merchant verification did not return JSON.",
      type,
    };
  }
  const status = readString(raw, "status");
  return {
    id: readString(raw, "id") ?? account,
    account,
    status:
      status === "ACCEPTED" ||
      status === "PROCESSING" ||
      status === "NEEDS_INFO" ||
      status === "REJECTED"
        ? status
        : "NEEDS_INFO",
    message:
      readString(raw, "message") ?? "Merchant verification callback result.",
    type: readString(raw, "type") ?? type,
  };
}

/**
 * SEP-12 customer lookup. Never auto-ACCEPTED for unknown accounts.
 * Production path: LOMI_MERCHANT_VERIFY_URL (existing merchant KYC).
 * Lab path: SEP12_ACCEPTED_ACCOUNTS or a previously stored customer.
 */
export async function verifySep12Customer(input: {
  account?: string;
  type?: string;
}): Promise<Sep12Customer> {
  const type = input.type ?? "sep24";
  const account = input.account?.trim();
  if (!account) {
    return {
      id: "unknown",
      status: "NEEDS_INFO",
      message: "account is required for SEP-12.",
      type,
      fields: { account: "Stellar account G…" },
    };
  }

  const remote = await callMerchantVerification(account, type);
  if (remote) {
    persist(remote);
    return remote;
  }

  const stored = localLookup(account);
  if (stored) return stored;

  if (acceptedAccounts().has(account)) {
    const accepted: Sep12Customer = {
      id: account,
      account,
      status: "ACCEPTED",
      message: "Lab allowlist. Production uses merchant verification.",
      type,
    };
    persist(accepted);
    return accepted;
  }

  return {
    id: account,
    account,
    status: "NEEDS_INFO",
    message:
      "Unknown account. Complete merchant verification or set SEP12_ACCEPTED_ACCOUNTS for the lab.",
    type,
    fields: {
      account: "Stellar G… address",
      email: "Merchant email on lomi.",
    },
  };
}

/**
 * Callback PUT. On testnet, account + email persists ACCEPTED so Freighter
 * can finish SEP-12 without a lomi. merchant-verify URL.
 */
export async function upsertSep12Customer(input: {
  account?: string;
  type?: string;
  email?: string;
}): Promise<Sep12Customer> {
  const existing = await verifySep12Customer({
    account: input.account,
    type: input.type,
  });
  if (existing.status === "ACCEPTED") return existing;
  const email = input.email?.trim() ?? "";
  if (!isTestnetKyc() || !existing.account || !looksLikeEmail(email)) {
    return existing;
  }
  const accepted: Sep12Customer = {
    id: existing.account,
    account: existing.account,
    status: "ACCEPTED",
    message: "Sandbox KYC for SEP-24. No live merchant verification.",
    type: existing.type,
  };
  persist(accepted);
  return accepted;
}
