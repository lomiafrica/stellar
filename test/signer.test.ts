import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Account, Keypair, Networks, Transaction } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE } from "../src/config.js";
import {
  buildUsdcPayment,
  type PaymentNetwork,
} from "../src/stellar/payment.js";
import type { TransactionSigner } from "../src/stellar/signer.js";
import {
  AesGcmUnsealer,
  EnvelopeSigner,
  LocalKeypairSigner,
  sealSecret,
} from "../src/stellar/signer.js";

test("buildUsdcPayment signs through the signer and never reads a secret field", async () => {
  const kp = Keypair.random();
  let signed = false;
  const signer: TransactionSigner = {
    publicKey: () => kp.publicKey(),
    async sign(tx: Transaction) {
      assert.equal("secret" in signer, false);
      tx.sign(kp);
      signed = true;
      return tx;
    },
  };
  const merchant = Keypair.random();
  const network: PaymentNetwork = {
    loadAccount: async (pk) => new Account(pk, "1"),
    sendTransaction: async () => ({ hash: "unused", status: "PENDING" }),
    pollTransaction: async () => ({ status: "SUCCESS" }),
    getTransaction: async () => ({ status: "NOT_FOUND" }),
  };
  const built = await buildUsdcPayment(
    signer,
    merchant.publicKey(),
    "1",
    "payout-signer-aaaaaaaaaaaaaaaa",
    network,
  );
  assert.equal(signed, true);
  assert.equal(built.from, kp.publicKey());
  assert.equal(built.hash.length, 64);
  assert.equal(NETWORK_PASSPHRASE, Networks.TESTNET);
});

test("EnvelopeSigner unseals only while signing and checks the public key", async () => {
  const kp = Keypair.random();
  const kek = randomBytes(32);
  const packed = sealSecret(kp.secret(), kek);
  const signer = new EnvelopeSigner(
    kp.publicKey(),
    packed,
    new AesGcmUnsealer(kek),
  );
  assert.equal(signer.publicKey(), kp.publicKey());
  assert.equal("secret" in signer, false);
  const merchant = Keypair.random();
  const network: PaymentNetwork = {
    loadAccount: async (pk) => new Account(pk, "1"),
    sendTransaction: async () => ({ hash: "unused", status: "PENDING" }),
    pollTransaction: async () => ({ status: "SUCCESS" }),
    getTransaction: async () => ({ status: "NOT_FOUND" }),
  };
  const built = await buildUsdcPayment(
    signer,
    merchant.publicKey(),
    "1",
    "payout-envelope-aaaaaaaaaaaaaa",
    network,
  );
  assert.equal(built.from, kp.publicKey());
  assert.equal(built.hash.length, 64);
});

test("LocalKeypairSigner exposes only the public key", () => {
  const kp = Keypair.random();
  const signer = new LocalKeypairSigner(kp);
  assert.equal(signer.publicKey(), kp.publicKey());
  assert.equal("secret" in signer, false);
});
