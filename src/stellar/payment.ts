import {
  Account,
  BASE_FEE,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE } from "../config.js";
import { getHorizonServer, getRpcServer } from "./client.js";
import { stellarMemoFromPayoutId } from "./memo.js";
import type { TransactionSigner } from "./signer.js";
import { testnetUsdcAsset } from "./trustline.js";

export interface UsdcPaymentResult {
  hash: string;
  payoutId: string;
  amount: string;
  from: string;
  to: string;
  memo: string;
}

export interface BuiltUsdcPayment {
  tx: Transaction;
  hash: string;
  payoutId: string;
  amount: string;
  from: string;
  to: string;
  memo: string;
  maxTime: number;
}

export interface HorizonAccountLike {
  accountId(): string;
  sequenceNumber(): string;
}

export interface PaymentNetwork {
  loadAccount(publicKey: string): Promise<HorizonAccountLike>;
  sendTransaction(tx: Transaction): Promise<{ hash: string; status: string }>;
  pollTransaction(hash: string): Promise<{ status: string }>;
  getTransaction(hash: string): Promise<{ status: string }>;
}

export async function defaultPaymentNetwork(): Promise<PaymentNetwork> {
  const horizon = getHorizonServer();
  const rpc = getRpcServer();
  return {
    loadAccount: (publicKey) => horizon.loadAccount(publicKey),
    sendTransaction: async (tx) => {
      const send = await rpc.sendTransaction(tx);
      return { hash: send.hash, status: send.status };
    },
    pollTransaction: async (hash) => {
      const polled = await rpc.pollTransaction(hash, {
        attempts: 30,
        sleepStrategy: () => 2000,
      });
      return { status: polled.status };
    },
    getTransaction: async (hash) => {
      try {
        const found = await rpc.getTransaction(hash);
        return { status: found.status };
      } catch {
        return { status: "NOT_FOUND" };
      }
    },
  };
}

/** Build and sign a USDC Payment. Does not submit. Hash is known before send. */
export async function buildUsdcPayment(
  from: TransactionSigner,
  toPublicKey: string,
  amount: string,
  payoutId: string,
  network: PaymentNetwork,
): Promise<BuiltUsdcPayment> {
  const loaded = await network.loadAccount(from.publicKey());
  const source = new Account(loaded.accountId(), loaded.sequenceNumber());
  const usdc = testnetUsdcAsset();
  const memo = stellarMemoFromPayoutId(payoutId);
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: toPublicKey,
        asset: usdc,
        amount,
      }),
    )
    .addMemo(Memo.text(memo))
    .setTimeout(180)
    .build();

  await from.sign(tx);
  const hash = tx.hash().toString("hex");
  const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
  return {
    tx,
    hash,
    payoutId,
    amount,
    from: from.publicKey(),
    to: toPublicKey,
    memo,
    maxTime,
  };
}

export class PaymentNetworkError extends Error {
  constructor(
    readonly kind: "send_error" | "poll_failed",
    message: string,
  ) {
    super(message);
    this.name = "PaymentNetworkError";
  }
}

/** Submit a built payment and poll until SUCCESS. */
export async function submitUsdcPayment(
  built: BuiltUsdcPayment,
  network: PaymentNetwork,
): Promise<UsdcPaymentResult> {
  const send = await network.sendTransaction(built.tx);
  if (send.status === "ERROR") {
    throw new PaymentNetworkError(
      "send_error",
      `payment failed: ${JSON.stringify(send)}`,
    );
  }
  const polled = await network.pollTransaction(send.hash);
  if (polled.status !== "SUCCESS") {
    throw new PaymentNetworkError(
      "poll_failed",
      `payment not successful: ${polled.status} (${JSON.stringify(polled)}). If balance is 0 USDC, fund omnibus at https://faucet.circle.com (Stellar Testnet).`,
    );
  }
  return {
    hash: send.hash,
    payoutId: built.payoutId,
    amount: built.amount,
    from: built.from,
    to: built.to,
    memo: built.memo,
  };
}

export async function sendUsdcPayment(
  from: TransactionSigner,
  toPublicKey: string,
  amount: string,
  payoutId: string,
  network?: PaymentNetwork,
): Promise<UsdcPaymentResult> {
  const resolved = network ?? (await defaultPaymentNetwork());
  const built = await buildUsdcPayment(
    from,
    toPublicKey,
    amount,
    payoutId,
    resolved,
  );
  return submitUsdcPayment(built, resolved);
}
