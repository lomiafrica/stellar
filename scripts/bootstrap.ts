import {
  printFaucetHint,
  printLabHeader,
  printNext,
  printStepList,
  printWhy,
  SETTLE_USDC,
} from '../src/cli/talk.js';
import {
  formatAmount,
  loadAccountBalances,
} from '../src/cli/balances.js';
import { explorerAccount, explorerTx } from '../src/config.js';
import {
  createMerchantAccountFromOmnibus,
  ensureFundedAccount,
} from '../src/stellar/account.js';
import {
  generateAndStoreKeys,
  loadKeypair,
  persistStoredKeys,
  readStoredKeys,
} from '../src/stellar/keys.js';
import { establishUsdcTrustline } from '../src/stellar/trustline.js';
import { writeTestnetProof } from '../src/testnet-proof.js';

async function main() {
  printLabHeader();
  printStepList(1);
  printWhy(
    'Friendbot gives free testnet XLM. Trustlines let these accounts hold Circle USDC.',
  );
  console.log('');

  const existing = readStoredKeys();
  const keys = existing ?? generateAndStoreKeys();
  if (existing) {
    persistStoredKeys(existing);
    console.log('Reusing keys from .env or keys/ (not rotating).');
  } else {
    console.log('Created new testnet keys. Secrets stay in keys/ and .env (gitignored).');
  }
  console.log('');

  const omnibus = loadKeypair('omnibus');
  const merchant = loadKeypair('merchant');

  console.log('Omnibus: Friendbot XLM...');
  await ensureFundedAccount(omnibus);
  console.log(`  ${omnibus.publicKey()}`);
  console.log(`  ${explorerAccount(omnibus.publicKey())}`);
  console.log('');

  console.log('Merchant: create or fund...');
  const createHash = await createMerchantAccountFromOmnibus(omnibus, merchant);
  if (createHash) {
    console.log(`  created  ${explorerTx(createHash)}`);
  } else {
    console.log('  already on testnet');
  }
  await ensureFundedAccount(merchant);
  console.log(`  ${merchant.publicKey()}`);
  console.log(`  ${explorerAccount(merchant.publicKey())}`);
  console.log('');

  console.log('USDC trustlines...');
  const omnibusTrust = await establishUsdcTrustline(omnibus);
  const merchantTrust = await establishUsdcTrustline(merchant);
  if (omnibusTrust) {
    console.log(`  omnibus  ${explorerTx(omnibusTrust)}`);
  } else {
    console.log('  omnibus already trusts Circle USDC');
  }
  if (merchantTrust) {
    console.log(`  merchant ${explorerTx(merchantTrust)}`);
  } else {
    console.log('  merchant already trusts Circle USDC');
  }

  writeTestnetProof({
    omnibusPublicKey: omnibus.publicKey(),
    merchantPublicKey: merchant.publicKey(),
    createMerchantTx: createHash ?? undefined,
    omnibusTrustlineTx: omnibusTrust ?? undefined,
    merchantTrustlineTx: merchantTrust ?? undefined,
  });

  console.log('');
  const omnibusBal = await loadAccountBalances(omnibus.publicKey());
  if (omnibusBal.usdc >= SETTLE_USDC) {
    console.log(`Omnibus has ${formatAmount(omnibusBal.usdc)} USDC.`);
    printNext('pnpm settle:10');
    return;
  }
  printFaucetHint(keys.omnibus.publicKey);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
