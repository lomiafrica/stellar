import { Keypair, type Transaction } from "@stellar/stellar-sdk";
import { loadKeypair, type KeyRole } from "./keys.js";

/** Signs a built classic transaction. Local keys today; KMS can implement later. */
export interface TransactionSigner {
  publicKey(): string;
  sign(tx: Transaction): Promise<Transaction>;
}

/** Signs with an in-process Stellar SDK Keypair. */
export class LocalKeypairSigner implements TransactionSigner {
  constructor(private readonly keypair: Keypair) {}

  publicKey(): string {
    return this.keypair.publicKey();
  }

  async sign(tx: Transaction): Promise<Transaction> {
    tx.sign(this.keypair);
    return tx;
  }
}

export function loadSigner(role: KeyRole): TransactionSigner {
  return new LocalKeypairSigner(loadKeypair(role));
}
