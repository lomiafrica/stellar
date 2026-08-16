import { readLedger } from '../src/ledger/store.js';
import { reconcileTransaction } from '../src/ledger/reconcile.js';

async function main() {
  const rows = readLedger();
  if (rows.length === 0) {
    console.log('No settlements in ledger.');
    return;
  }
  for (const row of rows) {
    if (!row.stellar_tx_hash) {
      console.log(
        JSON.stringify({ payout_id: row.payout_id, skipped: 'no stellar_tx_hash' }),
      );
      continue;
    }
    const result = await reconcileTransaction(row.stellar_tx_hash);
    console.log(JSON.stringify({ payout_id: row.payout_id, ...result }, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
