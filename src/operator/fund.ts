import { CIRCLE_FAUCET_URL, SETTLE_USDC } from "../cli/talk.js";
import { loadAccountBalances } from "../cli/balances.js";
import { loadKeypair, readStoredKeys } from "../stellar/keys.js";
import { sendUsdcPayment } from "../stellar/payment.js";
import { LocalKeypairSigner } from "../stellar/signer.js";
import { SettleNotReadyError } from "./ready.js";

export interface FundResult {
  alreadyFunded: boolean;
  recycled: boolean;
  hash?: string;
  omnibusUsdc: number;
}

export async function fundOmnibusFromMerchant(
  minUsdc = SETTLE_USDC,
): Promise<FundResult> {
  if (!readStoredKeys()) {
    throw new SettleNotReadyError(
      "no_keys",
      { next: "pnpm bootstrap" },
      "Missing keys. Run pnpm bootstrap.",
    );
  }

  const omnibus = loadKeypair("omnibus");
  const merchant = loadKeypair("merchant");
  const beforeOmnibus = await loadAccountBalances(omnibus.publicKey());

  if (!beforeOmnibus.exists || !beforeOmnibus.hasUsdcTrustline) {
    throw new SettleNotReadyError(
      beforeOmnibus.exists ? "no_trustline" : "no_account",
      { next: "pnpm bootstrap", publicKey: omnibus.publicKey() },
      "Omnibus is not ready. Run pnpm bootstrap.",
    );
  }

  if (beforeOmnibus.usdc >= minUsdc) {
    return {
      alreadyFunded: true,
      recycled: false,
      omnibusUsdc: beforeOmnibus.usdc,
    };
  }

  const beforeMerchant = await loadAccountBalances(merchant.publicKey());
  const need = minUsdc - beforeOmnibus.usdc;
  if (!beforeMerchant.hasUsdcTrustline || beforeMerchant.usdc < need) {
    throw new SettleNotReadyError(
      "underfunded",
      {
        faucet: CIRCLE_FAUCET_URL,
        publicKey: omnibus.publicKey(),
        next: "pnpm fund",
      },
      `Need ${need} more test USDC on the omnibus. Merchant has ${beforeMerchant.usdc}. Fund the omnibus at the Circle faucet (Stellar Testnet).`,
    );
  }

  const paid = await sendUsdcPayment(
    new LocalKeypairSigner(merchant),
    omnibus.publicKey(),
    String(need),
    "lab-recycle-usdc",
  );
  const after = await loadAccountBalances(omnibus.publicKey());
  return {
    alreadyFunded: false,
    recycled: true,
    hash: paid.hash,
    omnibusUsdc: after.usdc,
  };
}
