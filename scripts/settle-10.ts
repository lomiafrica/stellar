import {
  printFaucetHint,
  printLabHeader,
  say,
  sayOk,
  SETTLE_USDC,
  thenRun,
} from '../src/cli/talk.js';
import { formatAmount, loadAccountBalances } from '../src/cli/balances.js';
import { runSettlementDemo } from '../src/settlement-demo.js';
import { loadKeypair } from '../src/stellar/keys.js';

async function main() {
  await printLabHeader(2);

  let omnibus;
  try {
    omnibus = loadKeypair('omnibus');
  } catch {
    await say('No keys yet.');
    await thenRun('pnpm bootstrap');
    process.exit(1);
  }

  const bal = await loadAccountBalances(omnibus.publicKey());
  if (!bal.exists) {
    await thenRun('pnpm bootstrap');
    process.exit(1);
  }
  if (bal.usdc < SETTLE_USDC) {
    await say(`${formatAmount(bal.usdc)} USDC`);
    await printFaucetHint(omnibus.publicKey());
    process.exit(1);
  }

  const result = await runSettlementDemo({ amount: String(SETTLE_USDC) });

  await say(`${result.amountUsdc} USDC`);
  await say(result.payoutId);
  await sayOk(result.explorerTx);
  await thenRun('pnpm proof');
}

main().catch((err) => {
  console.error(err);
  const underfunded =
    String(err).includes('payment failed') ||
    String(err).includes('op_underfunded');
  if (!underfunded) {
    process.exit(1);
  }
  try {
    const omnibus = loadKeypair('omnibus');
    printFaucetHint(omnibus.publicKey())
      .catch(() => undefined)
      .finally(() => process.exit(1));
  } catch {
    thenRun('pnpm bootstrap')
      .catch(() => undefined)
      .finally(() => process.exit(1));
  }
});
