import { printLabHeader, printNext, printStepList, printWhy } from '../src/cli/talk.js';
import { readLedger } from '../src/ledger/store.js';
import { reconcileTransaction } from '../src/ledger/reconcile.js';
import { explorerAccount, explorerTx, PUBLIC_BASE_URL } from '../src/config.js';
import { readStoredKeys } from '../src/stellar/keys.js';
import { readTestnetProof } from '../src/testnet-proof.js';

async function main() {
  printLabHeader();
  printStepList(3);
  printWhy(
    'Each link is something a reviewer can open without reading the code.',
  );
  console.log('');

  const keys = readStoredKeys();
  const proof = readTestnetProof();
  const rows = readLedger();
  const last = rows[rows.length - 1];

  const omnibusPk = keys?.omnibus.publicKey ?? proof?.omnibusPublicKey;
  const merchantPk = keys?.merchant.publicKey ?? proof?.merchantPublicKey;

  if (omnibusPk && merchantPk) {
    console.log(`Omnibus (treasury)     ${explorerAccount(omnibusPk)}`);
    console.log(`Merchant (destination) ${explorerAccount(merchantPk)}`);
  } else {
    console.log('No accounts yet.');
    printNext('pnpm bootstrap');
    return;
  }

  if (proof?.omnibusTrustlineTx) {
    console.log(
      `Omnibus USDC trust     ${explorerTx(proof.omnibusTrustlineTx)}`,
    );
  }
  if (proof?.merchantTrustlineTx) {
    console.log(
      `Merchant USDC trust    ${explorerTx(proof.merchantTrustlineTx)}`,
    );
  }

  const settlementHash = last?.stellar_tx_hash ?? proof?.settlementTx;
  if (settlementHash) {
    const amount = last?.amount_usdc ?? '10';
    console.log(
      `USDC Payment (~${amount})   ${explorerTx(settlementHash)}`,
    );
    const recon = await reconcileTransaction(settlementHash);
    console.log(
      `Reconcile              ${recon.ok ? 'OK' : 'FAILED'}  ${recon.details}`,
    );
  } else {
    console.log('No settlement yet.');
    printNext('pnpm settle:10');
    return;
  }

  console.log(
    `SEP-1 source           https://github.com/lomiafrica/stellar/blob/main/public/stellar.toml`,
  );
  console.log(
    `Architecture           https://github.com/lomiafrica/stellar/blob/main/docs/ARCHITECTURE.md`,
  );
  console.log(
    `SEP-1 local            ${PUBLIC_BASE_URL}/.well-known/stellar.toml`,
  );
  console.log('');
  console.log('Repository: https://github.com/lomiafrica/stellar');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
