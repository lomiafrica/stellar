import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { canonicalUsdcAmount, memoFits } from "./amounts.js";
import type { WalletPayment } from "./payments.js";
import { readWallet, writeWallet, type StoredWallet } from "./store.js";

export interface WalletChain {
  provision(secret: string): Promise<void>;
  listPayments(publicKey: string): Promise<WalletPayment[]>;
  submit(input: {
    secret: string;
    destination: string;
    amount: string;
    memo: string;
  }): Promise<{ hash: string }>;
}

export type WalletNetworkName = "testnet" | "public";

export function assertTestnetWallet(network: WalletNetworkName): void {
  if (network !== "testnet") {
    throw new Error("USDC wallet stays on testnet");
  }
}

export async function ensureWalletAccount(input: {
  organizationId: string;
  keysDir: string;
  network: WalletNetworkName;
  chain: WalletChain;
}): Promise<{ publicKey: string; created: boolean }> {
  assertTestnetWallet(input.network);
  const existing = readWallet(input.keysDir, input.organizationId);
  if (existing) {
    return { publicKey: existing.publicKey, created: false };
  }
  const keypair = Keypair.random();
  const stored: StoredWallet = {
    organizationId: input.organizationId,
    publicKey: keypair.publicKey(),
    secret: keypair.secret(),
  };
  await input.chain.provision(stored.secret);
  writeWallet(input.keysDir, stored);
  return { publicKey: stored.publicKey, created: true };
}

export async function listWalletPayments(input: {
  organizationId: string;
  keysDir: string;
  network: WalletNetworkName;
  chain: WalletChain;
}): Promise<{ publicKey: string; payments: WalletPayment[] }> {
  assertTestnetWallet(input.network);
  const existing = readWallet(input.keysDir, input.organizationId);
  if (!existing) {
    throw new Error("wallet account is not created");
  }
  const payments = await input.chain.listPayments(existing.publicKey);
  return { publicKey: existing.publicKey, payments };
}

export async function submitWalletPayment(input: {
  organizationId: string;
  keysDir: string;
  network: WalletNetworkName;
  chain: WalletChain;
  destination: string;
  amount: string;
  memo: string;
}): Promise<{
  hash: string;
  amount: string;
  from: string;
  to: string;
  memo: string;
}> {
  assertTestnetWallet(input.network);
  const amount = canonicalUsdcAmount(input.amount);
  if (!memoFits(input.memo)) {
    throw new Error("memo must be 1 to 28 bytes");
  }
  if (!StrKey.isValidEd25519PublicKey(input.destination)) {
    throw new Error("destination must be a Stellar address");
  }
  const existing = readWallet(input.keysDir, input.organizationId);
  if (!existing) {
    throw new Error("wallet account is not created");
  }
  if (input.destination === existing.publicKey) {
    throw new Error("destination must be a different address");
  }
  const submitted = await input.chain.submit({
    secret: existing.secret,
    destination: input.destination,
    amount,
    memo: input.memo,
  });
  return {
    hash: submitted.hash,
    amount,
    from: existing.publicKey,
    to: input.destination,
    memo: input.memo,
  };
}
