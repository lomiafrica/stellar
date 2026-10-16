import { Keypair } from "@stellar/stellar-sdk";
import { STELLAR_USDC_ISSUER } from "../config.js";
import { ensureFundedAccount } from "../stellar/account.js";
import { getHorizonServer } from "../stellar/client.js";
import { LocalKeypairSigner } from "../stellar/signer.js";
import { establishUsdcTrustline } from "../stellar/trustline.js";
import { isJsonObject, parseJson, readString, type JsonObject } from "../json.js";
import {
  usdcPaymentsFromRecords,
  type HorizonPaymentInput,
  type WalletPayment,
} from "./payments.js";
import { submitOrgUsdcPayment } from "./submit.js";
import type { WalletChain } from "./service.js";

function asObject(value: object): JsonObject | null {
  const parsed = parseJson(JSON.stringify(value));
  return isJsonObject(parsed) ? parsed : null;
}

function paymentInput(
  record: object,
  memos: ReadonlyMap<string, string>,
): HorizonPaymentInput | null {
  const body = asObject(record);
  if (!body) return null;
  const type = readString(body, "type");
  const transactionHash = readString(body, "transaction_hash");
  const from = readString(body, "from");
  const to = readString(body, "to");
  const amount = readString(body, "amount");
  const assetCode = readString(body, "asset_code") ?? "";
  const assetIssuer = readString(body, "asset_issuer") ?? "";
  if (!type || !transactionHash || !from || !to || !amount) return null;
  return {
    type,
    transactionHash,
    from,
    to,
    amount,
    assetCode,
    assetIssuer,
    memo: memos.get(transactionHash) ?? "",
  };
}

export async function listHorizonUsdcPayments(
  publicKey: string,
): Promise<WalletPayment[]> {
  const horizon = getHorizonServer();
  const payments = await horizon
    .payments()
    .forAccount(publicKey)
    .limit(50)
    .order("desc")
    .call();
  const transactions = await horizon
    .transactions()
    .forAccount(publicKey)
    .limit(50)
    .order("desc")
    .call();
  const memos = new Map<string, string>();
  for (const tx of transactions.records) {
    const body = asObject(tx);
    if (!body) continue;
    const hash = readString(body, "hash");
    const memoType = readString(body, "memo_type");
    const memo = readString(body, "memo");
    if (hash && memoType === "text" && memo) memos.set(hash, memo);
  }
  const records: HorizonPaymentInput[] = [];
  for (const record of payments.records) {
    const parsed = paymentInput(record, memos);
    if (parsed) records.push(parsed);
  }
  return usdcPaymentsFromRecords(publicKey, STELLAR_USDC_ISSUER, records);
}

export function createHorizonWalletChain(): WalletChain {
  return {
    async provision(secret: string): Promise<void> {
      const keypair = Keypair.fromSecret(secret);
      await ensureFundedAccount(keypair);
      await establishUsdcTrustline(keypair);
    },
    listPayments: (publicKey) => listHorizonUsdcPayments(publicKey),
    async submit(input): Promise<{ hash: string }> {
      const signer = new LocalKeypairSigner(Keypair.fromSecret(input.secret));
      const result = await submitOrgUsdcPayment(
        signer,
        input.destination,
        input.amount,
        input.memo,
      );
      return { hash: result.hash };
    },
  };
}
