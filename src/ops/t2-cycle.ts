import { randomUUID } from "node:crypto";
import { dispatchLastMile } from "../anchor/last-mile.js";
import { reconcileThreeWay } from "../ledger/reconcile.js";
import { runSettlementDemo } from "../payouts/stellar-payout.service.js";

const BRIDGE_WAIT_MS = 100_000;
const POLL_MS = 10_000;

export interface T2CycleReport {
  payout_id: string;
  xof_collect: { rail: string; amount_xof: string; status: string };
  bridge_transfer_id: string | undefined;
  stellar_transaction_id: string;
  explorer_tx: string;
  xof_payout: { rail: string; amount_xof: string; status: string };
  reconcile_ok: boolean;
  breaks: string[];
}

/**
 * One payout through every leg: XOF collect, Bridge transfer, testnet USDC
 * payment with the payout id as memo, XOF payout, then the three-way
 * reconcile. Runs inside the lab (ops route) or in place (pnpm t2:cycle).
 */
export async function runT2Cycle(
  phone = "+2250700000000",
): Promise<T2CycleReport> {
  const payoutId = randomUUID();
  const collect = dispatchLastMile({
    rail: "wave",
    amountXof: "65596",
    phone,
    payoutId,
    kind: "deposit",
  });
  const settled = await runSettlementDemo({
    payoutId,
    amount: "1",
    amount_number: 1,
    currency_code: "USD",
    phone,
    last_mile_rail: "wave",
  });
  const payout = dispatchLastMile({
    rail: "wave",
    amountXof: settled.mockOfframp.amountXof,
    phone,
    payoutId,
    kind: "withdraw",
  });
  // Bridge sandbox moves a transfer to payment_processed a little after it is created.
  const deadline = Date.now() + BRIDGE_WAIT_MS;
  let threeWay = await reconcileThreeWay(payoutId);
  while (
    !threeWay.ok &&
    threeWay.breaks.every((name) => name === "bridge_incomplete") &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    threeWay = await reconcileThreeWay(payoutId);
  }
  return {
    payout_id: payoutId,
    xof_collect: {
      rail: collect.rail,
      amount_xof: collect.amountXof,
      status: collect.status,
    },
    bridge_transfer_id: settled.bridgeTransferId,
    stellar_transaction_id: settled.stellarTxHash,
    explorer_tx: settled.explorerTx,
    xof_payout: {
      rail: payout.rail,
      amount_xof: payout.amountXof,
      status: payout.status,
    },
    reconcile_ok: threeWay.ok,
    breaks: threeWay.breaks,
  };
}
