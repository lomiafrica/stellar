import {
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { NETWORK_PASSPHRASE } from '../config.js';
import { getHorizonServer, getRpcServer } from './client.js';

export async function fundWithFriendbot(publicKey: string): Promise<void> {
  const rpc = getRpcServer();
  try {
    await rpc.requestAirdrop(publicKey);
    return;
  } catch {
    // Fallback: Horizon friendbot
    const horizon = getHorizonServer();
    await horizon.friendbot(publicKey).call();
  }
}

export async function ensureFundedAccount(
  keypair: Keypair,
  minBalanceXlm = '5',
): Promise<void> {
  const horizon = getHorizonServer();
  try {
    await horizon.loadAccount(keypair.publicKey());
    return;
  } catch {
    await fundWithFriendbot(keypair.publicKey());
  }

  const parent = await horizon.loadAccount(keypair.publicKey());
  const balance = parent.balances.find((b) => b.asset_type === 'native');
  const native = balance && 'balance' in balance ? Number(balance.balance) : 0;
  if (native >= Number(minBalanceXlm)) {
    return;
  }
  await fundWithFriendbot(keypair.publicKey());
}

export async function createMerchantAccountFromOmnibus(
  omnibus: Keypair,
  merchant: Keypair,
): Promise<string | undefined> {
  const horizon = getHorizonServer();
  const rpc = getRpcServer();
  await ensureFundedAccount(omnibus);

  try {
    await horizon.loadAccount(merchant.publicKey());
    return undefined;
  } catch {
    // merchant account does not exist yet
  }

  const source = await horizon.loadAccount(omnibus.publicKey());
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.createAccount({
        destination: merchant.publicKey(),
        startingBalance: '5',
      }),
    )
    .setTimeout(180)
    .build();

  tx.sign(omnibus);
  const send = await rpc.sendTransaction(tx);
  if (send.status === 'ERROR') {
    throw new Error(`createAccount failed: ${JSON.stringify(send)}`);
  }
  const polled = await rpc.pollTransaction(send.hash, {
    attempts: 30,
    sleepStrategy: () => 2000,
  });
  if (polled.status !== 'SUCCESS') {
    throw new Error(`createAccount not successful: ${polled.status}`);
  }
  return send.hash;
}
