import {
  printFaucetHint,
  printLabHeader,
  say,
  sayDim,
  sayOk,
  SETTLE_USDC,
  thenRun,
} from "../src/cli/talk.js";
import { formatAmount, loadAccountBalances } from "../src/cli/balances.js";
import { explorerAccount, explorerTx } from "../src/config.js";
import {
  createMerchantAccountFromOmnibus,
  ensureFundedAccount,
} from "../src/stellar/account.js";
import {
  generateAndStoreKeys,
  loadKeypair,
  persistStoredKeys,
  readStoredKeys,
} from "../src/stellar/keys.js";
import { establishUsdcTrustline } from "../src/stellar/trustline.js";
import { writeTestnetProof } from "../src/testnet-proof.js";

async function main() {
  await printLabHeader(1);

  const existing = readStoredKeys();
  const keys = existing ?? generateAndStoreKeys();
  if (existing) {
    persistStoredKeys(existing);
    await sayDim("Reusing keys.");
  } else {
    await sayDim("New keys in keys/ and .env.");
  }
  console.log("");

  const omnibus = loadKeypair("omnibus");
  const merchant = loadKeypair("merchant");

  await say("Omnibus");
  await ensureFundedAccount(omnibus);
  await sayDim(omnibus.publicKey());
  await sayDim(explorerAccount(omnibus.publicKey()));
  console.log("");

  await say("Merchant");
  const createHash = await createMerchantAccountFromOmnibus(omnibus, merchant);
  if (createHash) {
    await sayOk(explorerTx(createHash));
  }
  await ensureFundedAccount(merchant);
  await sayDim(merchant.publicKey());
  await sayDim(explorerAccount(merchant.publicKey()));
  console.log("");

  const omnibusTrust = await establishUsdcTrustline(omnibus);
  const merchantTrust = await establishUsdcTrustline(merchant);
  if (omnibusTrust) {
    await sayOk(`USDC  ${explorerTx(omnibusTrust)}`);
  }
  if (merchantTrust) {
    await sayOk(`USDC  ${explorerTx(merchantTrust)}`);
  }

  writeTestnetProof({
    omnibusPublicKey: omnibus.publicKey(),
    merchantPublicKey: merchant.publicKey(),
    createMerchantTx: createHash ?? undefined,
    omnibusTrustlineTx: omnibusTrust ?? undefined,
    merchantTrustlineTx: merchantTrust ?? undefined,
  });

  console.log("");
  const omnibusBal = await loadAccountBalances(omnibus.publicKey());
  if (omnibusBal.usdc >= SETTLE_USDC) {
    await say(`${formatAmount(omnibusBal.usdc)} USDC`);
    await thenRun("pnpm settle:10");
    return;
  }
  await printFaucetHint(keys.omnibus.publicKey);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
