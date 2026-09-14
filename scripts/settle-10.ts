import {
  printFaucetHint,
  printLabHeader,
  say,
  sayOk,
  SETTLE_USDC,
  thenRun,
} from "../src/cli/talk.js";
import { fundOmnibusFromMerchant } from "../src/operator/fund.js";
import { SettleNotReadyError } from "../src/operator/ready.js";
import { runSettlementDemo } from "../src/settlement-demo.js";
import { loadKeypair } from "../src/stellar/keys.js";

async function main() {
  await printLabHeader(2);

  try {
    await fundOmnibusFromMerchant(SETTLE_USDC);
    const result = await runSettlementDemo({ amount: String(SETTLE_USDC) });
    await say(`${result.amountUsdc} USDC`);
    await say(result.payoutId);
    await sayOk(result.explorerTx);
    await thenRun("pnpm proof");
  } catch (err) {
    if (err instanceof SettleNotReadyError) {
      await say(err.message);
      if (err.hint.publicKey) {
        await printFaucetHint(err.hint.publicKey);
      } else if (err.hint.next) {
        await thenRun(err.hint.next);
      }
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  const underfunded =
    String(err).includes("payment failed") ||
    String(err).includes("op_underfunded");
  if (!underfunded) {
    process.exit(1);
  }
  try {
    const omnibus = loadKeypair("omnibus");
    printFaucetHint(omnibus.publicKey())
      .catch(() => undefined)
      .finally(() => process.exit(1));
  } catch {
    thenRun("pnpm bootstrap")
      .catch(() => undefined)
      .finally(() => process.exit(1));
  }
});
