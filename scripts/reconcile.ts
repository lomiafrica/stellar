import { readLedger } from "../src/ledger/store.js";
import { reconcileThreeWay } from "../src/ledger/reconcile.js";

async function main() {
  const rows = readLedger();
  if (rows.length === 0) {
    console.log("No settlements in ledger.");
    return;
  }
  let failed = 0;
  for (const row of rows) {
    const result = await reconcileThreeWay(row.payout_id);
    console.log(
      JSON.stringify(
        {
          payout_id: row.payout_id,
          ok: result.ok,
          breaks: result.breaks,
          chain: result.chain,
          bridge: result.bridge,
        },
        null,
        2,
      ),
    );
    if (!result.ok) failed += 1;
  }
  if (failed > 0) {
    console.error(`reconcile failed ${failed}/${rows.length}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
