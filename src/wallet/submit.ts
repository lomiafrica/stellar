import {
  Account,
  BASE_FEE,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE } from "../config.js";
import { defaultPaymentNetwork, submitUsdcPayment } from "../stellar/payment.js";
import { testnetUsdcAsset } from "../stellar/trustline.js";
import type { TransactionSigner } from "../stellar/signer.js";

export async function submitOrgUsdcPayment(
  from: TransactionSigner,
  toPublicKey: string,
  amount: string,
  memo: string,
): Promise<{ hash: string }> {
  const network = await defaultPaymentNetwork();
  const loaded = await network.loadAccount(from.publicKey());
  const source = new Account(loaded.accountId(), loaded.sequenceNumber());
  const builder = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(
    Operation.payment({
      destination: toPublicKey,
      asset: testnetUsdcAsset(),
      amount,
    }),
  );
  if (memo) builder.addMemo(Memo.text(memo));
  const tx = builder.setTimeout(180).build();
  await from.sign(tx);
  const hash = tx.hash().toString("hex");
  const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
  const submitted = await submitUsdcPayment(
    {
      tx,
      hash,
      payoutId: memo,
      amount,
      from: from.publicKey(),
      to: toPublicKey,
      memo,
      maxTime,
    },
    network,
  );
  return { hash: submitted.hash };
}
