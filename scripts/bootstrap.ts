import { explorerAccount } from '../src/config.js';
import {
  createMerchantAccountFromOmnibus,
  ensureFundedAccount,
} from '../src/stellar/account.js';
import {
  generateAndStoreKeys,
  loadKeypair,
  readStoredKeys,
} from '../src/stellar/keys.js';
import { establishUsdcTrustline } from '../src/stellar/trustline.js';
import { writeTestnetProof } from '../src/testnet-proof.js';

async function main() {
  console.log('lomi. Stellar testnet bootstrap\n');

  const existing = readStoredKeys();
  const keys = existing ?? generateAndStoreKeys();
  if (existing) {
    console.log('Reusing existing keys in keys/ (not rotating).\n');
  }
  const omnibus = loadKeypair('omnibus');
  const merchant = loadKeypair('merchant');

  console.log('Funding omnibus with Friendbot (free testnet XLM)...');
  await ensureFundedAccount(omnibus);
  console.log('Omnibus:', omnibus.publicKey());
  console.log('Explorer:', explorerAccount(omnibus.publicKey()));

  console.log('\nCreating / funding merchant account...');
  const createHash = await createMerchantAccountFromOmnibus(omnibus, merchant);
  if (createHash) {
    console.log('Created merchant account, tx:', createHash);
  }
  await ensureFundedAccount(merchant);
  console.log('Merchant:', merchant.publicKey());
  console.log('Explorer:', explorerAccount(merchant.publicKey()));

  console.log('\nEstablishing USDC trustlines...');
  const omnibusTrust = await establishUsdcTrustline(omnibus);
  const merchantTrust = await establishUsdcTrustline(merchant);
  if (omnibusTrust) console.log('Omnibus trustline tx:', omnibusTrust);
  if (merchantTrust) console.log('Merchant trustline tx:', merchantTrust);

  writeTestnetProof({
    omnibusPublicKey: omnibus.publicKey(),
    merchantPublicKey: merchant.publicKey(),
    createMerchantTx: createHash ?? undefined,
    omnibusTrustlineTx: omnibusTrust ?? undefined,
    merchantTrustlineTx: merchantTrust ?? undefined,
  });

  console.log('\n--- Next step (manual, free) ---');
  console.log(
    '1. Open https://faucet.circle.com and select Stellar Testnet',
  );
  console.log('2. Paste OMNIBUS public key:', keys.omnibus.publicKey);
  console.log('3. Request test USDC (e.g. 10 USDC for the demo payment)');
  console.log('4. Run: pnpm settle:10');
  console.log('\nKeys and .env updated. Secrets are in keys/ and .env (gitignored).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
