import {
  BASE_FEE,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { NETWORK_PASSPHRASE } from '../config.js';
import { getHorizonServer, getRpcServer } from './client.js';
import { testnetUsdcAsset } from './trustline.js';

export interface UsdcPaymentResult {
  hash: string;
  payoutId: string;
  amount: string;
  from: string;
  to: string;
  memo: string;
}

export async function sendUsdcPayment(
  from: Keypair,
  toPublicKey: string,
  amount: string,
  payoutId: string,
): Promise<UsdcPaymentResult> {
  const horizon = getHorizonServer();
  const rpc = getRpcServer();
  const source = await horizon.loadAccount(from.publicKey());
  const usdc = testnetUsdcAsset();

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
    .addMemo(Memo.text(payoutId.slice(0, 28)))
    .setTimeout(180)
    .build();

  tx.sign(from);
  const send = await rpc.sendTransaction(tx);
  if (send.status === 'ERROR') {
    throw new Error(`payment failed: ${JSON.stringify(send)}`);
  }
  const polled = await rpc.pollTransaction(send.hash, {
    attempts: 30,
    sleepStrategy: () => 2000,
  });
  if (polled.status !== 'SUCCESS') {
    const detail = JSON.stringify(polled);
    throw new Error(
      `payment not successful: ${polled.status} (${detail}). If balance is 0 USDC, fund omnibus at https://faucet.circle.com (Stellar Testnet).`,
    );
  }

  return {
    hash: send.hash,
    payoutId,
    amount,
    from: from.publicKey(),
    to: toPublicKey,
    memo: payoutId.slice(0, 28),
  };
}
