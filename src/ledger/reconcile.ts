import { getHorizonServer, getRpcServer } from '../stellar/client.js';
import { findByPayoutId, findByTxHash } from './store.js';

export interface ReconcileResult {
  ok: boolean;
  payoutId?: string;
  hash: string;
  onChainSuccess: boolean;
  memoMatch: boolean;
  ledgerFound: boolean;
  details: string;
}

export async function reconcileTransaction(hash: string): Promise<ReconcileResult> {
  const rpc = getRpcServer();
  const horizon = getHorizonServer();
  const ledgerRow = findByTxHash(hash);

  let onChainSuccess = false;
  let memoMatch = false;
  let payoutId: string | undefined = ledgerRow?.payout_id;

  try {
    const polled = await rpc.getTransaction(hash);
    onChainSuccess = polled.status === 'SUCCESS';
  } catch {
    try {
      const tx = await horizon.transactions().transaction(hash).call();
      onChainSuccess = tx.successful;
      if (tx.memo_type === 'text' && tx.memo) {
        const row = findByPayoutId(tx.memo) ?? ledgerRow;
        if (row && tx.memo.startsWith(row.payout_id.slice(0, 28))) {
          memoMatch = true;
          payoutId = row.payout_id;
        }
      }
    } catch {
      onChainSuccess = false;
    }
  }

  if (ledgerRow && onChainSuccess) {
    memoMatch =
      ledgerRow.stellar_tx_hash === hash &&
      ledgerRow.memo === ledgerRow.payout_id.slice(0, 28);
    payoutId = ledgerRow.payout_id;
  }

  const ok =
    onChainSuccess && memoMatch && ledgerRow !== undefined;

  return {
    ok,
    payoutId,
    hash,
    onChainSuccess,
    memoMatch,
    ledgerFound: ledgerRow !== undefined,
    details: ok
      ? 'Ledger row matches successful on-chain payment with memo.'
      : 'Reconciliation incomplete. Check hash, ledger, and memo.',
  };
}
