import { randomUUID } from "node:crypto";
import "../src/env.js";
import { dispatchLastMile } from "../src/anchor/last-mile.js";
import { reconcileThreeWay } from "../src/ledger/reconcile.js";
import { runSettlementDemo } from "../src/payouts/stellar-payout.service.js";

async function main(): Promise<void> {
  const payoutId = randomUUID();
  const phone = process.env.T2_PHONE?.trim() || "+2250700000000";
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
  const threeWay = await reconcileThreeWay(payoutId);
  const report = {
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
  console.log(JSON.stringify(report, null, 2));
  if (!threeWay.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
