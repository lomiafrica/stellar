import { readLedger } from '../src/ledger/store.js';
import { reconcileTransaction } from '../src/ledger/reconcile.js';
import { explorerAccount, explorerTx, PUBLIC_BASE_URL } from '../src/config.js';
import { readStoredKeys } from '../src/stellar/keys.js';
import { readTestnetProof } from '../src/testnet-proof.js';

async function main() {
  const keys = readStoredKeys();
  const proof = readTestnetProof();
  const rows = readLedger();
  const last = rows[rows.length - 1];

  const omnibusPk = keys?.omnibus.publicKey ?? proof?.omnibusPublicKey;
  const merchantPk = keys?.merchant.publicKey ?? proof?.merchantPublicKey;

  console.log('## Testnet lab notes (explorer links)\n');
  console.log('STELLAR TESTNET LAB');
  if (omnibusPk && merchantPk) {
    console.log(`• Testnet omnibus (lomi. treasury demo): ${explorerAccount(omnibusPk)}`);
    console.log(`• Testnet merchant destination: ${explorerAccount(merchantPk)}`);
  } else {
    console.log('• Run pnpm bootstrap first to generate keys.');
  }
  if (proof?.omnibusTrustlineTx) {
    console.log(`• USDC trustline (omnibus): ${explorerTx(proof.omnibusTrustlineTx)}`);
  }
  if (proof?.merchantTrustlineTx) {
    console.log(`• USDC trustline (merchant): ${explorerTx(proof.merchantTrustlineTx)}`);
  }
  const settlementHash =
    last?.stellar_tx_hash ?? proof?.settlementTx;
  if (settlementHash) {
    const amount = last?.amount_usdc ?? '10';
    console.log(`• Memo-keyed USDC settlement (~${amount} USDC): ${explorerTx(settlementHash)}`);
    const recon = await reconcileTransaction(settlementHash);
    console.log(`• Reconciliation: ${recon.ok ? 'OK' : 'FAILED'} (${recon.details})`);
  }
  console.log(`• SEP-1 stellar.toml (source): https://github.com/lomiafrica/stellar/blob/main/public/stellar.toml`);
  console.log(
    '• Architecture: https://github.com/lomiafrica/stellar/blob/main/docs/ARCHITECTURE.md',
  );
  console.log(`• SEP-1 stellar.toml (local demo): ${PUBLIC_BASE_URL}/.well-known/stellar.toml`);
  console.log('\nRepository: https://github.com/lomiafrica/stellar');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
