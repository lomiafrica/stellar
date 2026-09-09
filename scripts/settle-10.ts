import {
  printFaucetHint,
  printLabHeader,
  printNext,
  printStepList,
  printWhy,
  SETTLE_USDC,
} from '../src/cli/talk.js';
import { formatAmount, loadAccountBalances } from '../src/cli/balances.js';
import { runSettlementDemo } from '../src/settlement-demo.js';
import { loadKeypair } from '../src/stellar/keys.js';

async function main() {
  printLabHeader();
  printStepList(2);
  printWhy(
    `Send ${SETTLE_USDC} Circle USDC from the omnibus to the merchant. Memo is the payout id so we can reconcile.`,
  );
  console.log('');

  let omnibus;
  try {
    omnibus = loadKeypair('omnibus');
  } catch {
    console.log('No keys. Bootstrap first.');
    printNext('pnpm bootstrap');
    process.exit(1);
  }

  const bal = await loadAccountBalances(omnibus.publicKey());
  if (!bal.exists) {
    console.log('Omnibus is not on testnet yet.');
    printNext('pnpm bootstrap');
    process.exit(1);
  }
  if (bal.usdc < SETTLE_USDC) {
    console.log(`Omnibus has ${formatAmount(bal.usdc)} USDC.`);
    printFaucetHint(omnibus.publicKey());
    process.exit(1);
  }

  console.log(
    `Omnibus has ${formatAmount(bal.usdc)} USDC. Sending ${SETTLE_USDC}...`,
  );
  console.log('');

  const result = await runSettlementDemo({ amount: String(SETTLE_USDC) });

  console.log(`Payout id     ${result.payoutId}`);
  console.log(`Memo          first 28 chars of that id`);
  console.log(`Amount        ${result.amountUsdc} USDC`);
  console.log(`On-chain      ${result.explorerTx}`);
  console.log(`Omnibus       ${result.explorerAccountOmnibus}`);
  console.log(`Merchant      ${result.explorerAccountMerchant}`);
  console.log(`Bridge        mock (${result.bridgeTransferId})`);
  console.log(`Last mile     mock Wave (no real mobile money)`);
  console.log('');
  printNext('pnpm proof');
}

main().catch((err) => {
  console.error(err);
  if (
    String(err).includes('payment failed') ||
    String(err).includes('op_underfunded')
  ) {
    try {
      const omnibus = loadKeypair('omnibus');
      console.error('');
      printFaucetHint(omnibus.publicKey());
    } catch {
      printNext('pnpm bootstrap');
    }
  }
  process.exit(1);
});
