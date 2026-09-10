import {
  ink,
  printLabHeader,
  say,
  sayDim,
  sayOk,
  thenRun,
} from '../src/cli/talk.js';
import { readLedger } from '../src/ledger/store.js';
import { reconcileTransaction } from '../src/ledger/reconcile.js';
import { explorerAccount, explorerTx } from '../src/config.js';
import { readStoredKeys } from '../src/stellar/keys.js';
import { readTestnetProof } from '../src/testnet-proof.js';

async function main() {
  await printLabHeader(3);

  const keys = readStoredKeys();
  const saved = readTestnetProof();
  const rows = readLedger();
  const last = rows[rows.length - 1];

  const omnibusPk = keys?.omnibus.publicKey ?? saved?.omnibusPublicKey;
  const merchantPk = keys?.merchant.publicKey ?? saved?.merchantPublicKey;

  if (!omnibusPk || !merchantPk) {
    await say('No accounts yet.');
    await thenRun('pnpm bootstrap');
    return;
  }

  await sayDim(explorerAccount(omnibusPk));
  await sayDim(explorerAccount(merchantPk));

  const settlementHash = last?.stellar_tx_hash ?? saved?.settlementTx;
  if (!settlementHash) {
    await thenRun('pnpm settle:10');
    return;
  }

  await sayOk(explorerTx(settlementHash));
  const recon = await reconcileTransaction(settlementHash);
  if (recon.ok) {
    await sayOk('OK');
  } else {
    await say(`${ink.yellow('FAILED')}  ${recon.details}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
