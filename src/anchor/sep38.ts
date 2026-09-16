import { randomUUID } from "node:crypto";
import { readString, type JsonObject } from "../json.js";
import { readJsonArray, writeJsonArray } from "./json-store.js";

/** BCEAO XOF per 1 EUR. */
export const XOF_PER_EUR = 655.957;
export const DEFAULT_QUOTE_TTL_SECONDS = 60;
export const DEFAULT_SPREAD_BPS = 50;

const STORE = "sep38-quotes.json";

export interface Sep38Quote {
  id: string;
  sellAsset: string;
  buyAsset: string;
  sellAmount: string;
  buyAmount: string;
  price: string;
  expiresAt: string;
  createdAt: string;
}

function eurUsdRate(): number {
  const raw = Number(process.env.EUR_USD_RATE ?? "1.08");
  return Number.isFinite(raw) && raw > 0 ? raw : 1.08;
}

function spreadBps(): number {
  const raw = Number(
    process.env.QUOTE_SPREAD_BPS ?? String(DEFAULT_SPREAD_BPS),
  );
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_SPREAD_BPS;
}

/**
 * XOF per 1 USDC. 1 EUR = 655.957 XOF. EUR_USD_RATE is USD per 1 EUR.
 */
export function xofPerUsdc(): number {
  const usdPerEur = eurUsdRate();
  const xofPerUsd = XOF_PER_EUR / usdPerEur;
  return xofPerUsd * (1 + spreadBps() / 10_000);
}

function persist(quote: Sep38Quote): void {
  const rows = readJsonArray(STORE);
  const next: JsonObject = {
    id: quote.id,
    sell_asset: quote.sellAsset,
    buy_asset: quote.buyAsset,
    sell_amount: quote.sellAmount,
    buy_amount: quote.buyAmount,
    price: quote.price,
    expires_at: quote.expiresAt,
    created_at: quote.createdAt,
  };
  rows.push(next);
  writeJsonArray(STORE, rows);
}

function readStored(id: string): Sep38Quote | undefined {
  const row = readJsonArray(STORE).find(
    (item) => readString(item, "id") === id,
  );
  if (!row) return undefined;
  return {
    id,
    sellAsset: readString(row, "sell_asset") ?? "",
    buyAsset: readString(row, "buy_asset") ?? "",
    sellAmount: readString(row, "sell_amount") ?? "",
    buyAmount: readString(row, "buy_amount") ?? "",
    price: readString(row, "price") ?? "",
    expiresAt: readString(row, "expires_at") ?? "",
    createdAt: readString(row, "created_at") ?? "",
  };
}

export function createSep38Quote(input: {
  sellAsset: string;
  buyAsset: string;
  sellAmount?: string;
  buyAmount?: string;
  ttlSeconds?: number;
}): Sep38Quote {
  const price = xofPerUsdc();
  const sell = input.sellAsset.toUpperCase();
  const buy = input.buyAsset.toUpperCase();
  const ttl = input.ttlSeconds ?? DEFAULT_QUOTE_TTL_SECONDS;
  const now = Date.now();
  let sellAmount = input.sellAmount;
  let buyAmount = input.buyAmount;

  if (sell.includes("XOF") && buy.includes("USDC")) {
    if (sellAmount && !buyAmount) {
      buyAmount = (Number(sellAmount) / price).toFixed(7);
    } else if (buyAmount && !sellAmount) {
      sellAmount = (Number(buyAmount) * price).toFixed(0);
    }
  } else if (sell.includes("USDC") && buy.includes("XOF")) {
    if (sellAmount && !buyAmount) {
      buyAmount = (Number(sellAmount) * price).toFixed(0);
    } else if (buyAmount && !sellAmount) {
      sellAmount = (Number(buyAmount) / price).toFixed(7);
    }
  }

  if (!sellAmount || !buyAmount) {
    throw new Error("sell_amount or buy_amount is required");
  }

  const quote: Sep38Quote = {
    id: `q_${randomUUID()}`,
    sellAsset: input.sellAsset,
    buyAsset: input.buyAsset,
    sellAmount,
    buyAmount,
    price: String(price),
    expiresAt: new Date(now + ttl * 1000).toISOString(),
    createdAt: new Date(now).toISOString(),
  };
  persist(quote);
  return quote;
}

export function getSep38Quote(id: string): Sep38Quote | undefined {
  return readStored(id);
}

export function assertQuoteUsable(id: string): Sep38Quote {
  const quote = getSep38Quote(id);
  if (!quote) {
    throw new Error("Unknown quote_id");
  }
  if (Date.parse(quote.expiresAt) <= Date.now()) {
    throw new Error("Quote expired");
  }
  return quote;
}
