import { getHorizonServer, getRpcServer } from "../stellar/client.js";
import { memoMatchesPayoutId } from "../stellar/memo.js";
import { getBridgeAdapter, type BridgeTransfer } from "../bridge/adapter.js";
import {
  findByPayoutId,
  findByTxHash,
  type StellarSettlementRecord,
} from "./store.js";

export interface ReconcileResult {
  ok: boolean;
  payoutId?: string;
  hash: string;
  onChainSuccess: boolean;
  memoMatch: boolean;
  ledgerFound: boolean;
  details: string;
}

export type ReconcileBreak =
  | "ledger_without_chain"
  | "chain_without_ledger"
  | "bridge_incomplete"
  | "amount_mismatch"
  | "memo_mismatch";

export interface ThreeWayResult {
  ledger?: StellarSettlementRecord;
  chain: { success: boolean; hash?: string; amount?: string };
  bridge: { status?: string; usdcAmount?: string };
  ok: boolean;
  breaks: ReconcileBreak[];
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
      ? "Ledger row matches successful on-chain payment with memo."
      : "Reconciliation incomplete. Check hash, ledger, and memo.",
  };
}

/** Ledger vs chain vs Bridge. Breaks are explicit so a daily job can fail loud. */
export function evaluateThreeWay(input: {
  ledger?: StellarSettlementRecord;
  chainSuccess: boolean;
  chainHash?: string;
  chainMemo?: string;
  chainAmount?: string;
  bridge?: Pick<BridgeTransfer, "status" | "usdcAmount">;
}): ThreeWayResult {
  const breaks: ReconcileBreak[] = [];
  const ledger = input.ledger;

  if (ledger && !input.chainSuccess) {
    breaks.push("ledger_without_chain");
  }
  if (input.chainSuccess && !ledger) {
    breaks.push("chain_without_ledger");
  }
  if (!input.bridge || input.bridge.status !== "completed") {
    breaks.push("bridge_incomplete");
  }
  if (
    ledger &&
    input.chainAmount !== undefined &&
    input.chainAmount !== "" &&
    Number(input.chainAmount) !== Number(ledger.amount_usdc)
  ) {
    breaks.push("amount_mismatch");
  }
  if (
    ledger &&
    input.bridge?.usdcAmount &&
    Number(input.bridge.usdcAmount) !== Number(ledger.amount_usdc) &&
    !breaks.includes("amount_mismatch")
  ) {
    breaks.push("amount_mismatch");
  }
  if (ledger) {
    const memoOk = memoMatchesPayoutId(ledger.memo, ledger.payout_id);
    const chainMemoOk =
      !input.chainMemo ||
      memoMatchesPayoutId(input.chainMemo, ledger.payout_id);
    if (!memoOk || !chainMemoOk) {
      breaks.push("memo_mismatch");
    }
  }

  return {
    ledger,
    chain: {
      success: input.chainSuccess,
      hash: input.chainHash ?? ledger?.stellar_tx_hash,
      amount: input.chainAmount,
    },
    bridge: {
      status: input.bridge?.status,
      usdcAmount: input.bridge?.usdcAmount,
    },
    ok: breaks.length === 0 && Boolean(ledger) && input.chainSuccess,
    breaks,
  };
}

export async function reconcileTransaction(
  hash: string,
): Promise<ReconcileResult> {
  const rpc = getRpcServer();
  const horizon = getHorizonServer();
  const ledgerRow = findByTxHash(hash);

  let onChainSuccess = false;
  let onChainMemo: string | undefined;

  try {
    const polled = await rpc.getTransaction(hash);
    onChainSuccess = polled.status === "SUCCESS";
  } catch {
    try {
      const tx = await horizon.transactions().transaction(hash).call();
      onChainSuccess = tx.successful;
      if (tx.memo_type === "text" && tx.memo) {
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

export async function reconcileThreeWay(
  payoutId: string,
): Promise<ThreeWayResult> {
  const ledger = findByPayoutId(payoutId);
  const hash = ledger?.stellar_tx_hash;
  let chainSuccess = false;
  let chainMemo: string | undefined;
  let chainAmount: string | undefined;

  if (hash) {
    const twoWay = await reconcileTransaction(hash);
    chainSuccess = twoWay.onChainSuccess;
    try {
      const horizon = getHorizonServer();
      const tx = await horizon.transactions().transaction(hash).call();
      if (tx.memo_type === "text" && tx.memo) chainMemo = tx.memo;
      const ops = await horizon.payments().forTransaction(hash).call();
      const payment = ops.records.find(
        (row) => "amount" in row && typeof row.amount === "string",
      );
      if (payment && "amount" in payment) {
        chainAmount = payment.amount;
      }
    } catch {
      chainMemo = chainMemo ?? ledger?.memo;
    }
  }

  let bridge: Pick<BridgeTransfer, "status" | "usdcAmount"> | undefined;
  if (ledger?.bridge_transfer_id) {
    const found = await getBridgeAdapter().getTransfer(
      ledger.bridge_transfer_id,
    );
    if (found) {
      bridge = { status: found.status, usdcAmount: found.usdcAmount };
    }
  }

  return evaluateThreeWay({
    ledger,
    chainSuccess,
    chainHash: hash,
    chainMemo,
    chainAmount,
    bridge,
  });
}
