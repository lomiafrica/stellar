/** Sends stay at or under $10. The phone never raises this. */
export const USDC_SEND_CAP = 10;

export function canonicalUsdcAmount(raw: string): string {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("amount must be a dollar amount");
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("amount must be greater than zero");
  }
  if (value > USDC_SEND_CAP) {
    throw new Error("Sends are limited to $10");
  }
  return value.toFixed(2);
}

export function memoFits(memo: string): boolean {
  return Buffer.byteLength(memo, "utf8") <= 28 && memo.length > 0;
}
