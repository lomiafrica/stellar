/** Stellar text memos are 28 bytes. Payout ids are UUIDs; we keep the prefix. */
export const STELLAR_MEMO_MAX = 28;

export function stellarMemoFromPayoutId(payoutId: string): string {
  return payoutId.slice(0, STELLAR_MEMO_MAX);
}

export function memoMatchesPayoutId(memo: string, payoutId: string): boolean {
  return memo === stellarMemoFromPayoutId(payoutId);
}
