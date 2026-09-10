import { getHorizonServer, getRpcServer } from '../stellar/client.js';
import { memoMatchesPayoutId } from '../stellar/memo.js';
import { findByPayoutId, findByTxHash, type StellarSettlementRecord } from './store.js';

export interface ReconcileResult {
  ok: boolean;
  payoutId?: string;
  hash: string;
  onChainSuccess: boolean;
  memoMatch: boolean;
  ledgerFound: boolean;
  details: string;
}

export function evaluateReconcile(input: {
  hash: string;
  ledgerRow?: StellarSettlementRecord;
  onChainSuccess: boolean;
  onChainMemo?: string;
}): ReconcileResult {
  const { hash, ledgerRow, onChainSuccess, onChainMemo } = input;
  let payoutId = ledgerRow?.payout_id;
  let memoMatch = false;

  if (ledgerRow) {
    memoMatch =
      ledgerRow.stellar_tx_hash === hash &&
      memoMatchesPayoutId(ledgerRow.memo, ledgerRow.payout_id);
    if (onChainMemo && !memoMatchesPayoutId(onChainMemo, ledgerRow.payout_id)) {
      memoMatch = false;
    }
  } else if (onChainMemo) {
    const byMemo = findByPayoutId(onChainMemo);
    if (byMemo && memoMatchesPayoutId(onChainMemo, byMemo.payout_id)) {
      memoMatch = true;
      payoutId = byMemo.payout_id;
    }
  }

  const ledgerFound = ledgerRow !== undefined;
  const ok = onChainSuccess && memoMatch && ledgerFound;

  return {
    ok,
    payoutId,
    hash,
    onChainSuccess,
    memoMatch,
    ledgerFound,
    details: ok
      ? 'Ledger row matches successful on-chain payment with memo.'
      : 'Reconciliation incomplete. Check hash, ledger, and memo.',
  };
}

export async function reconcileTransaction(hash: string): Promise<ReconcileResult> {
  const rpc = getRpcServer();
  const horizon = getHorizonServer();
  const ledgerRow = findByTxHash(hash);

  let onChainSuccess = false;
  let onChainMemo: string | undefined;

  try {
    const polled = await rpc.getTransaction(hash);
    onChainSuccess = polled.status === 'SUCCESS';
  } catch {
    try {
      const tx = await horizon.transactions().transaction(hash).call();
      onChainSuccess = tx.successful;
      if (tx.memo_type === 'text' && tx.memo) {
        onChainMemo = tx.memo;
      }
    } catch {
      onChainSuccess = false;
    }
  }

  return evaluateReconcile({
    hash,
    ledgerRow,
    onChainSuccess,
    onChainMemo,
  });
}
