import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { TESTNET_USDC_ISSUER } from "../src/config.js";
import { usdcPaymentsFromRecords } from "../src/wallet/payments.js";
import {
  ensureWalletAccount,
  listWalletPayments,
  submitWalletPayment,
  type WalletChain,
} from "../src/wallet/service.js";
import { readWallet } from "../src/wallet/store.js";

const ORG = "00000000-0000-4000-8000-0000000000ab";

function tempKeys(): string {
  return mkdtempSync(join(tmpdir(), "lomi-wallet-"));
}

test("usdc payment list keeps inbound USDC and drops other assets", () => {
  const account = "GACCOUNT";
  const payments = usdcPaymentsFromRecords(account, TESTNET_USDC_ISSUER, [
    {
      type: "payment",
      transactionHash: "in",
      from: "GPAYER",
      to: account,
      amount: "10.0000000",
      assetCode: "USDC",
      assetIssuer: TESTNET_USDC_ISSUER,
      memo: "sale",
    },
    {
      type: "payment",
      transactionHash: "native",
      from: "GPAYER",
      to: account,
      amount: "1",
      assetCode: "XLM",
      assetIssuer: "",
      memo: "",
    },
    {
      type: "create_account",
      transactionHash: "create",
      from: "GOTHER",
      to: account,
      amount: "5",
      assetCode: "USDC",
      assetIssuer: TESTNET_USDC_ISSUER,
      memo: "",
    },
  ]);
  assert.equal(payments.length, 1);
  assert.equal(payments[0]?.direction, "in");
  assert.equal(payments[0]?.memo, "sale");
});

test("ensure creates one custodial account and does not return the secret", async () => {
  const keysDir = tempKeys();
  let provisions = 0;
  const chain: WalletChain = {
    async provision() {
      provisions += 1;
    },
    async listPayments() {
      return [];
    },
    async submit() {
      return { hash: "hash" };
    },
  };
  try {
    const created = await ensureWalletAccount({
      organizationId: ORG,
      keysDir,
      network: "testnet",
      chain,
    });
    const again = await ensureWalletAccount({
      organizationId: ORG,
      keysDir,
      network: "testnet",
      chain,
    });
    assert.equal(provisions, 1);
    assert.equal(created.created, true);
    assert.equal(again.created, false);
    assert.equal(again.publicKey, created.publicKey);
    assert.equal("secret" in created, false);
    const stored = readWallet(keysDir, ORG);
    assert.ok(stored);
    assert.equal(stored.publicKey, created.publicKey);
    assert.match(stored.secret, /^S/);
    const file = readFileSync(
      join(keysDir, "wallets", `${ORG}.json`),
      "utf8",
    );
    assert.equal(file.includes(stored.secret), true);
    assert.equal(JSON.stringify(created).includes(stored.secret), false);
  } finally {
    rmSync(keysDir, { recursive: true, force: true });
  }
});

test("send of 10 submits and 10.01 does not", async () => {
  const keysDir = tempKeys();
  let submits = 0;
  const chain: WalletChain = {
    async provision() {
      return undefined;
    },
    async listPayments() {
      return [];
    },
    async submit() {
      submits += 1;
      return { hash: "sent" };
    },
  };
  const destination = Keypair.random().publicKey();
  try {
    await ensureWalletAccount({
      organizationId: ORG,
      keysDir,
      network: "testnet",
      chain,
    });
    await assert.rejects(
      () =>
        submitWalletPayment({
          organizationId: ORG,
          keysDir,
          network: "testnet",
          chain,
          destination,
          amount: "10.01",
          memo: "send",
        }),
      /limited to \$10/,
    );
    assert.equal(submits, 0);
    const sent = await submitWalletPayment({
      organizationId: ORG,
      keysDir,
      network: "testnet",
      chain,
      destination,
      amount: "10",
      memo: "send",
    });
    assert.equal(submits, 1);
    assert.equal(sent.amount, "10.00");
    assert.equal(sent.hash, "sent");
    assert.equal(JSON.stringify(sent).includes("secret"), false);
  } finally {
    rmSync(keysDir, { recursive: true, force: true });
  }
});

test("public network and a bad organization id are refused", async () => {
  const chain: WalletChain = {
    async provision() {
      throw new Error("should not provision");
    },
    async listPayments() {
      return [];
    },
    async submit() {
      return { hash: "no" };
    },
  };
  await assert.rejects(
    () =>
      ensureWalletAccount({
        organizationId: ORG,
        keysDir: tempKeys(),
        network: "public",
        chain,
      }),
    /testnet/,
  );
  await assert.rejects(
    () =>
      listWalletPayments({
        organizationId: "../etc",
        keysDir: tempKeys(),
        network: "testnet",
        chain,
      }),
    /UUID/,
  );
});
