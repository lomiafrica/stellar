import { CIRCLE_FAUCET_URL, SETTLE_USDC } from "../cli/talk.js";
import { loadAccountBalances } from "../cli/balances.js";
import { loadKeypair, readStoredKeys } from "../stellar/keys.js";

export type SettleNotReadyReason =
  | "no_keys"
  | "no_account"
  | "no_trustline"
  | "underfunded";

export class SettleNotReadyError extends Error {
  readonly code = "SETTLE_NOT_READY";
  constructor(
    readonly reason: SettleNotReadyReason,
    readonly hint: { faucet?: string; publicKey?: string; next?: string },
    message: string,
  ) {
    super(message);
    this.name = "SettleNotReadyError";
  }
}

export interface ReadyState {
  omnibusPublicKey: string;
  merchantPublicKey: string;
  usdc: number;
}

export async function assertReadyToSettle(
  minUsdc = SETTLE_USDC,
): Promise<ReadyState> {
  if (!readStoredKeys()) {
    throw new SettleNotReadyError(
      "no_keys",
      { next: "pnpm bootstrap" },
      "Missing keys. Run pnpm bootstrap.",
    );
  }

  const omnibus = loadKeypair("omnibus");
  const merchant = loadKeypair("merchant");
  const bal = await loadAccountBalances(omnibus.publicKey());

  if (!bal.exists) {
    throw new SettleNotReadyError(
      "no_account",
      { next: "pnpm bootstrap", publicKey: omnibus.publicKey() },
      "Omnibus account is not on-chain. Run pnpm bootstrap.",
    );
  }

  if (!bal.hasUsdcTrustline) {
    throw new SettleNotReadyError(
      "no_trustline",
      { next: "pnpm bootstrap", publicKey: omnibus.publicKey() },
      "Omnibus has no Circle USDC trustline. Run pnpm bootstrap.",
    );
  }

  if (bal.usdc < minUsdc) {
    throw new SettleNotReadyError(
      "underfunded",
      {
        faucet: CIRCLE_FAUCET_URL,
        publicKey: omnibus.publicKey(),
        next: "pnpm fund",
      },
      `Omnibus has ${bal.usdc} USDC; need ${minUsdc}. Run pnpm fund or use the Circle faucet (Stellar Testnet).`,
    );
  }

  return {
    omnibusPublicKey: omnibus.publicKey(),
    merchantPublicKey: merchant.publicKey(),
    usdc: bal.usdc,
  };
}
