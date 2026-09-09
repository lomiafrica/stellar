import {
  printFaucetHint,
  printLabHeader,
  printNext,
  printStepList,
  SETTLE_USDC,
} from '../src/cli/talk.js';
import {
  formatAmount,
  loadAccountBalances,
} from '../src/cli/balances.js';
import { explorerAccount } from '../src/config.js';
import { readStoredKeys } from '../src/stellar/keys.js';

async function main() {
  printLabHeader();
  printStepList();

  const keys = readStoredKeys();
  if (!keys) {
    console.log('No keys yet. Bootstrap creates the omnibus and merchant accounts.');
    printNext('pnpm bootstrap');
    return;
  }

  const omnibus = await loadAccountBalances(keys.omnibus.publicKey);
  const merchant = await loadAccountBalances(keys.merchant.publicKey);

  printRole('Omnibus', 'lomi. treasury. Signs the USDC Payment.', omnibus);
  console.log('');
  printRole('Merchant', 'Custodial destination. Merchants never see this key.', merchant);
  console.log('');

  if (!omnibus.exists) {
    console.log('Omnibus is not on testnet yet.');
    printNext('pnpm bootstrap');
    return;
  }

  if (omnibus.usdc < SETTLE_USDC) {
    printFaucetHint(omnibus.publicKey);
    return;
  }

  console.log(`Omnibus has ${formatAmount(omnibus.usdc)} USDC.`);
  printNext('pnpm settle:10');
}

function printRole(
  title: string,
  why: string,
  bal: Awaited<ReturnType<typeof loadAccountBalances>>,
): void {
  console.log(`${title}  ${bal.publicKey}`);
  console.log(`  ${why}`);
  if (!bal.exists) {
    console.log('  not on testnet yet');
    return;
  }
  console.log(`  XLM   ${formatAmount(bal.xlm)}`);
  console.log(`  USDC  ${formatAmount(bal.usdc)}`);
  console.log(`  ${explorerAccount(bal.publicKey)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
