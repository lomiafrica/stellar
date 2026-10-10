import { createSep38Quote, xofPerUsdc, type Sep38Quote } from "./sep38.js";

export interface RateFee {
  asset: string;
  total: string;
  details: Array<{ name: string; amount: string }>;
}

export interface FirmOrIndicativeRate {
  id?: string;
  price: string;
  sell_amount: string;
  buy_amount: string;
  expires_at?: string;
  fee: RateFee;
}

export interface RateCallbackResponse {
  rate: FirmOrIndicativeRate;
}

export interface RateQuery {
  type?: string;
  sellAsset: string;
  buyAsset: string;
  sellAmount?: string;
  buyAmount?: string;
  expiresAfter?: string;
}

/** Price the platform checks as sell_amount ~= price * buy_amount. */
export function platformPrice(
  sellAsset: string,
  buyAsset: string,
  xofPer = xofPerUsdc(),
): string {
  const sell = sellAsset.toUpperCase();
  const buy = buyAsset.toUpperCase();
  if (sell.includes("USDC") && buy.includes("XOF")) {
    return String(1 / xofPer);
  }
  return String(xofPer);
}

function ttlSeconds(expiresAfter?: string): number {
  const parsed = expiresAfter ? Date.parse(expiresAfter) : Number.NaN;
  if (!Number.isFinite(parsed)) return 60;
  const seconds = Math.ceil((parsed - Date.now()) / 1000) + 30;
  return Math.max(60, seconds);
}

function feeFor(asset: string): RateFee {
  return {
    asset,
    total: "0",
    details: [{ name: "spread", amount: "0" }],
  };
}

/**
 * Anchor Platform GET /rate callback.
 * Firm quotes include id and expires_at. Indicative quotes do not.
 */
export function buildSep38Rate(query: RateQuery): RateCallbackResponse {
  const firm = (query.type ?? "indicative").toLowerCase() === "firm";
  const quote: Sep38Quote = createSep38Quote({
    sellAsset: query.sellAsset,
    buyAsset: query.buyAsset,
    sellAmount: query.sellAmount,
    buyAmount: query.buyAmount,
    ttlSeconds: firm ? ttlSeconds(query.expiresAfter) : 60,
  });
  const rate: FirmOrIndicativeRate = {
    price: platformPrice(quote.sellAsset, quote.buyAsset, Number(quote.price)),
    sell_amount: quote.sellAmount,
    buy_amount: quote.buyAmount,
    fee: feeFor(quote.sellAsset),
  };
  if (firm) {
    rate.id = quote.id;
    rate.expires_at = quote.expiresAt;
  }
  return { rate };
}
