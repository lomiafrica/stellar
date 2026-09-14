import {
  printFaucetHint,
  printLabHeader,
  say,
  sayDim,
  SETTLE_USDC,
  thenRun,
} from "../src/cli/talk.js";
import { formatAmount, loadAccountBalances } from "../src/cli/balances.js";
import { explorerAccount } from "../src/config.js";
import { readStoredKeys } from "../src/stellar/keys.js";

async function main() {
  await printLabHeader();

  const keys = readStoredKeys();
  if (!keys) {
    await say("No accounts yet.");
    await thenRun("pnpm bootstrap");
    return;
  }

  const omnibus = await loadAccountBalances(keys.omnibus.publicKey);
  const merchant = await loadAccountBalances(keys.merchant.publicKey);

  await printRole("Omnibus", omnibus);
  console.log("");
  await printRole("Merchant", merchant);
  console.log("");

  if (!omnibus.exists) {
    await thenRun("pnpm bootstrap");
    return;
  }

  if (omnibus.usdc < SETTLE_USDC) {
    await printFaucetHint(omnibus.publicKey);
    return;
  }

  await thenRun("pnpm settle:10");
}

async function printRole(
  title: string,
  bal: Awaited<ReturnType<typeof loadAccountBalances>>,
): Promise<void> {
  await say(title);
  await sayDim(bal.publicKey);
  if (!bal.exists) {
    await sayDim("not on testnet yet");
    return;
  }
  await say(`  ${formatAmount(bal.xlm)} XLM`);
  await say(`  ${formatAmount(bal.usdc)} USDC`);
  await sayDim(`  ${explorerAccount(bal.publicKey)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
