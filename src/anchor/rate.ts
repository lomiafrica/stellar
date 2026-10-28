import { createSep38Quote, type Sep38Quote } from "./sep38.js";

export interface RateFee {
  asset: string;
  total: string;
  details?: Array<{ name: string; amount: string }>;
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

/**
 * The platform checks sell_amount ~= price * buy_amount at the sell asset's
 * decimals, so price comes from the rounded amounts, not the peg.
 */
export function quotedPrice(sellAmount: string, buyAmount: string): string {
  return String(Number(sellAmount) / Number(buyAmount));
}

function ttlSeconds(expiresAfter?: string): number {
  const parsed = expiresAfter ? Date.parse(expiresAfter) : Number.NaN;
  if (!Number.isFinite(parsed)) return 60;
  const seconds = Math.ceil((parsed - Date.now()) / 1000) + 30;
  return Math.max(60, seconds);
}

/**
 * The platform rejects fee.details when fee.total is zero, and a fee asset
 * with zero significant_decimals (XOF), so the fee sits on the Stellar leg.
 */
function feeFor(sellAsset: string, buyAsset: string): RateFee {
  const asset = sellAsset.startsWith("stellar:") ? sellAsset : buyAsset;
  return { asset, total: "0" };
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
    price: quotedPrice(quote.sellAmount, quote.buyAmount),
    sell_amount: quote.sellAmount,
    buy_amount: quote.buyAmount,
    fee: feeFor(quote.sellAsset, quote.buyAsset),
  };
  if (firm) {
    rate.id = quote.id;
    rate.expires_at = quote.expiresAt;
  }
  return { rate };
}
