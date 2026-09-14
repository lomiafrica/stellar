import {
  printFaucetHint,
  printLabHeader,
  say,
  sayOk,
  SETTLE_USDC,
  thenRun,
} from "../src/cli/talk.js";
import { formatAmount } from "../src/cli/balances.js";
import { fundOmnibusFromMerchant } from "../src/operator/fund.js";
import { SettleNotReadyError } from "../src/operator/ready.js";
import { loadKeypair } from "../src/stellar/keys.js";

async function main() {
  await printLabHeader(1);

  try {
    const result = await fundOmnibusFromMerchant(SETTLE_USDC);
    if (result.alreadyFunded) {
      await say(`${formatAmount(result.omnibusUsdc)} USDC`);
      await thenRun("pnpm settle:10");
      return;
    }
    if (result.hash) {
      await sayOk(result.hash);
    }
    await say(`${formatAmount(result.omnibusUsdc)} USDC`);
    await thenRun("pnpm settle:10");
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
  try {
    printFaucetHint(loadKeypair("omnibus").publicKey())
      .catch(() => undefined)
      .finally(() => process.exit(1));
  } catch {
    process.exit(1);
  }
});
