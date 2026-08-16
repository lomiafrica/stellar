import {
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { NETWORK_PASSPHRASE, STELLAR_USDC_ISSUER } from '../config.js';
import { getHorizonServer, getRpcServer } from './client.js';
import { ensureFundedAccount } from './account.js';

export function testnetUsdcAsset(): Asset {
  return new Asset('USDC', STELLAR_USDC_ISSUER);
}

export async function establishUsdcTrustline(
  keypair: Keypair,
  limit = '1000000',
): Promise<string | null> {
  const horizon = getHorizonServer();
  const rpc = getRpcServer();
  const usdc = testnetUsdcAsset();

  await ensureFundedAccount(keypair);
  const account = await horizon.loadAccount(keypair.publicKey());

  const existing = account.balances.find(
    (b) =>
      b.asset_type !== 'native' &&
      'asset_code' in b &&
      b.asset_code === 'USDC' &&
      'asset_issuer' in b &&
      b.asset_issuer === STELLAR_USDC_ISSUER,
  );
  if (existing) {
    return null;
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset: usdc,
        limit,
      }),
    )
    .setTimeout(180)
    .build();

  tx.sign(keypair);
  const send = await rpc.sendTransaction(tx);
  if (send.status === 'ERROR') {
    throw new Error(`changeTrust failed: ${JSON.stringify(send)}`);
  }
  const polled = await rpc.pollTransaction(send.hash, {
    attempts: 30,
    sleepStrategy: () => 2000,
  });
  if (polled.status !== 'SUCCESS') {
    throw new Error(`changeTrust not successful: ${polled.status}`);
  }
  return send.hash;
}
