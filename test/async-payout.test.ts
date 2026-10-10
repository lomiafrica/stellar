import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Account, Keypair, Transaction } from "@stellar/stellar-sdk";
import { findByPayoutId } from "../src/ledger/store.js";
import {
  acceptStellarPayout,
  runSettlementDemo,
  type SettlementRuntime,
} from "../src/payouts/stellar-payout.service.js";
import { MockBridgeAdapter } from "../src/bridge/adapter.js";
import type { PaymentNetwork } from "../src/stellar/payment.js";
import type { TransactionSigner } from "../src/stellar/signer.js";

function isolate(): void {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-async-"));
  delete process.env.ALERT_WEBHOOK_URL;
}

test("accept returns before send, and the owned resume sends once", async () => {
  isolate();
  const omnibus = Keypair.random();
  const merchant = Keypair.random();
  const sends: string[] = [];
  const network: PaymentNetwork = {
    loadAccount: async (pk) => new Account(pk, "1"),
    sendTransaction: async (tx) => {
      const hash = tx.hash().toString("hex");
      sends.push(hash);
      return { hash, status: "PENDING" };
    },
    pollTransaction: async () => ({ status: "SUCCESS" }),
    getTransaction: async () => ({ status: "NOT_FOUND" }),
  };
  const signer: TransactionSigner = {
    publicKey: () => omnibus.publicKey(),
    async sign(tx: Transaction) {
      tx.sign(omnibus);
      return tx;
    },
  };
  const runtime: SettlementRuntime = {
    assertReady: async () => ({
      omnibusPublicKey: omnibus.publicKey(),
      merchantPublicKey: merchant.publicKey(),
      usdc: 10,
    }),
    loadOmnibusSigner: () => signer,
    merchantPublicKey: () => merchant.publicKey(),
    network,
    bridge: new MockBridgeAdapter(),
    now: () => Date.now(),
  };
  const accepted = await acceptStellarPayout(
    { payoutId: "async-1", amount: "1", currency_code: "USD", amount_number: 1 },
    runtime,
  );
  assert.equal(accepted.status, "processing");
  assert.equal(sends.length, 0);
  assert.equal(findByPayoutId("async-1")?.status, "processing");
  const settled = await runSettlementDemo(
    {
      payoutId: "async-1",
      amount: "1",
      currency_code: "USD",
      amount_number: 1,
      continueOwned: true,
    },
    runtime,
  );
  assert.equal(sends.length, 1);
  assert.equal(settled.stellarTxHash, sends[0]);
  assert.equal(findByPayoutId("async-1")?.status, "completed");
});
