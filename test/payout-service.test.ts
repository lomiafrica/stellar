import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Account, Keypair, Transaction } from "@stellar/stellar-sdk";
import { findByPayoutId, upsertSettlement } from "../src/ledger/store.js";
import {
  notReadyBody,
  runSettlementDemo,
  assertUsdcCaps,
} from "../src/payouts/stellar-payout.service.js";
import { PayoutCapError } from "../src/payouts/errors.js";
import type { SettlementRuntime } from "../src/payouts/stellar-payout.service.js";
import type { PaymentNetwork } from "../src/stellar/payment.js";
import type { TransactionSigner } from "../src/stellar/signer.js";
import { MockBridgeAdapter } from "../src/bridge/adapter.js";
import { SettleNotReadyError } from "../src/operator/ready.js";
import { stellarMemoFromPayoutId } from "../src/stellar/memo.js";

function isUnderfundedNotReady(error: Error): boolean {
  return error instanceof SettleNotReadyError && error.reason === "underfunded";
}

function isPerPayoutCap(error: Error): boolean {
  return error instanceof PayoutCapError && error.reason === "per_payout";
}

function isolate(): void {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-payout-"));
}

function signerFor(kp: Keypair): TransactionSigner {
  return {
    publicKey: () => kp.publicKey(),
    async sign(tx: Transaction) {
      tx.sign(kp);
      return tx;
    },
  };
}

function runtime(patch: {
  network: PaymentNetwork;
  now?: () => number;
  assertReady?: SettlementRuntime["assertReady"];
}): SettlementRuntime {
  const omnibus = Keypair.random();
  const merchant = Keypair.random();
  return {
    assertReady:
      patch.assertReady ??
      (async () => ({
        omnibusPublicKey: omnibus.publicKey(),
        merchantPublicKey: merchant.publicKey(),
        usdc: 10,
      })),
    loadOmnibusSigner: () => signerFor(omnibus),
    merchantPublicKey: () => merchant.publicKey(),
    network: patch.network,
    bridge: new MockBridgeAdapter(),
    now: patch.now ?? (() => Date.now()),
  };
}

function fakeNetwork(opts: {
  send?: () => Promise<{ hash: string; status: string }>;
  poll?: () => Promise<{ status: string }>;
  get?: (hash: string) => Promise<{ status: string }>;
  sends?: string[];
}): PaymentNetwork {
  const sends = opts.sends ?? [];
  return {
    loadAccount: async (pk) => new Account(pk, String(sends.length + 1)),
    sendTransaction: async (tx) => {
      const hash = tx.hash().toString("hex");
      sends.push(hash);
      if (opts.send) return opts.send();
      return { hash, status: "PENDING" };
    },
    pollTransaction: async () => {
      if (opts.poll) return opts.poll();
      return { status: "SUCCESS" };
    },
    getTransaction: async (hash) => {
      if (opts.get) return opts.get(hash);
      return { status: "NOT_FOUND" };
    },
  };
}

test("crash after submit: retry polls the persisted hash and does not send again", async () => {
  isolate();
  const sends: string[] = [];
  let polls = 0;
  const network = fakeNetwork({
    sends,
    poll: async () => {
      polls += 1;
      if (polls === 1) throw new Error("crash after submit");
      return { status: "SUCCESS" };
    },
    get: async () => ({ status: "SUCCESS" }),
  });
  const rt = runtime({ network });
  const payoutId = "payout-crash-retry-aaaaaaaaaaa";
  await assert.rejects(
    () => runSettlementDemo({ payoutId, amount: "1" }, rt),
    /crash after submit/,
  );
  const mid = findByPayoutId(payoutId);
  assert.equal(mid?.status, "processing");
  assert.ok(mid?.stellar_tx_hash);
  assert.equal(sends.length, 1);

  const second = await runSettlementDemo({ payoutId, amount: "1" }, rt);
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.stellarTxHash, sends[0]);
  assert.equal(sends.length, 1);
  assert.equal(findByPayoutId(payoutId)?.status, "completed");
});

test("RPC send ERROR marks the payout failed", async () => {
  isolate();
  const network = fakeNetwork({
    send: async () => ({ hash: "dead", status: "ERROR" }),
  });
  const payoutId = "payout-send-error-aaaaaaaaaaaa";
  await assert.rejects(
    () => runSettlementDemo({ payoutId, amount: "1" }, runtime({ network })),
    /payment failed/,
  );
  assert.equal(findByPayoutId(payoutId)?.status, "failed");
});

test("poll timeout leaves processing so a retry can poll the hash", async () => {
  isolate();
  const network = fakeNetwork({
    poll: async () => ({ status: "NOT_FOUND" }),
  });
  const payoutId = "payout-poll-timeout-aaaaaaaaaa";
  await assert.rejects(
    () => runSettlementDemo({ payoutId, amount: "1" }, runtime({ network })),
    /payment not successful/,
  );
  assert.equal(findByPayoutId(payoutId)?.status, "processing");
  assert.ok(findByPayoutId(payoutId)?.stellar_tx_hash);
});

test("each SettleNotReadyError reason maps to a 400 body", () => {
  const reasons = [
    "no_keys",
    "no_account",
    "no_trustline",
    "underfunded",
  ] as const;
  for (const reason of reasons) {
    const err = new SettleNotReadyError(
      reason,
      { next: "pnpm bootstrap" },
      reason,
    );
    const body = notReadyBody(err);
    assert.equal(body.success, false);
    assert.equal(body.reason, reason);
    assert.equal(body.message, reason);
  }
});

test("runSettlementDemo does not pay when not ready", async () => {
  isolate();
  const sends: string[] = [];
  const network = fakeNetwork({ sends });
  await assert.rejects(
    () =>
      runSettlementDemo(
        { payoutId: "payout-not-ready-aaaaaaaaaaaa", amount: "1" },
        runtime({
          network,
          assertReady: async () => {
            throw new SettleNotReadyError(
              "underfunded",
              { next: "pnpm fund" },
              "no usdc",
            );
          },
        }),
      ),
    isUnderfundedNotReady,
  );
  assert.equal(sends.length, 0);
});

test("same payout_id completed row still replays without a network call", async () => {
  isolate();
  const payoutId = "payout-idempotent-replay-0000001";
  const now = "2026-09-10T00:00:00.000Z";
  upsertSettlement({
    id: "row-1",
    organization_id: "00000000-0000-4000-8000-000000000001",
    environment: "test",
    payout_id: payoutId,
    destination: "self",
    last_mile_rail: "wave",
    amount: 10,
    currency_code: "USD",
    amount_usdc: "10",
    memo: stellarMemoFromPayoutId(payoutId),
    status: "completed",
    stellar_tx_hash: "hash-replay",
    created_at: now,
    updated_at: now,
  });
  const sends: string[] = [];
  const result = await runSettlementDemo(
    { payoutId, amount: "10" },
    runtime({ network: fakeNetwork({ sends }) }),
  );
  assert.equal(result.idempotentReplay, true);
  assert.equal(result.stellarTxHash, "hash-replay");
  assert.equal(sends.length, 0);
});

test("per-payout cap rejects oversized USDC", () => {
  isolate();
  const previous = process.env.LAB_MAX_USDC_PER_PAYOUT;
  process.env.LAB_MAX_USDC_PER_PAYOUT = "5";
  try {
    assert.throws(() => assertUsdcCaps(10), isPerPayoutCap);
  } finally {
    if (previous === undefined) delete process.env.LAB_MAX_USDC_PER_PAYOUT;
    else process.env.LAB_MAX_USDC_PER_PAYOUT = previous;
  }
});

test("parallel same payout_id submits once", async () => {
  isolate();
  const sends: string[] = [];
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let firstSend = true;
  const network = fakeNetwork({
    sends,
    send: async () => {
      if (firstSend) {
        firstSend = false;
        await gate;
      }
      return { hash: sends[sends.length - 1] ?? "pending", status: "PENDING" };
    },
  });
  const rt = runtime({ network });
  const payoutId = "payout-parallel-claim-aaaaaaaa";
  const first = runSettlementDemo({ payoutId, amount: "1" }, rt);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const second = runSettlementDemo({ payoutId, amount: "1" }, rt);
  release?.();
  const results = await Promise.allSettled([first, second]);
  const fulfilled = results.filter((row) => row.status === "fulfilled");
  assert.equal(sends.length, 1);
  assert.ok(fulfilled.length >= 1);
});
