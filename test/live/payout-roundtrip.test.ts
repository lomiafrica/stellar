import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import "../../src/env.js";
import { explorerTx, STELLAR_USDC_ISSUER } from "../../src/config.js";
import { amountsFromHorizonBalances } from "../../src/cli/balances.js";
import { sendUsdcPayment } from "../../src/stellar/payment.js";
import { LocalKeypairSigner } from "../../src/stellar/signer.js";
import { stellarMemoFromPayoutId } from "../../src/stellar/memo.js";
import {
  asRecord,
  fetchJson,
  horizonUrl,
  labHeaders,
  liveLabUrl,
  MERCHANT_PUBLIC,
  OMNIBUS_PUBLIC,
  recordLiveProof,
  TESTNET_USDC_ISSUER,
} from "./helpers.js";

const AMOUNT = process.env.LIVE_USDC_AMOUNT?.trim() || "1";
const OMNIBUS_XLM_FLOOR = 20;
const MERCHANT_XLM_FLOOR = 2;

interface HorizonAccount {
  balances?: Array<{
    asset_type: string;
    balance: string;
    asset_code?: string;
    asset_issuer?: string;
  }>;
}

async function account(publicKey: string) {
  const { status, body } = await fetchJson(`${horizonUrl()}/accounts/${publicKey}`);
  assert.equal(status, 200, `Horizon account ${publicKey} HTTP ${status}`);
  const amounts = amountsFromHorizonBalances(
    ((body as HorizonAccount).balances ?? []) as Parameters<
      typeof amountsFromHorizonBalances
    >[0],
  );
  return amounts;
}

test("T1.2 live payout round trip: one chain payment, recycle, zero net USDC", async () => {
  const secret = process.env.MERCHANT_SECRET?.trim();
  assert.ok(
    secret,
    "MERCHANT_SECRET is required. Set it locally or as the GitHub Actions secret. Never put OMNIBUS_SECRET in CI.",
  );
  const merchant = Keypair.fromSecret(secret);
  assert.equal(
    merchant.publicKey(),
    MERCHANT_PUBLIC,
    `MERCHANT_SECRET must be the lab merchant ${MERCHANT_PUBLIC}`,
  );

  const beforeOmnibus = await account(OMNIBUS_PUBLIC);
  const beforeMerchant = await account(merchant.publicKey());
  assert.ok(
    beforeOmnibus.xlm >= OMNIBUS_XLM_FLOOR,
    `Omnibus has ${beforeOmnibus.xlm} XLM; need ${OMNIBUS_XLM_FLOOR}. Top up from a funded testnet account. A 100 XLM reserve covers millions of 100-stroop hops.`,
  );
  if (beforeMerchant.xlm < MERCHANT_XLM_FLOOR) {
    const bot = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(merchant.publicKey())}`,
    );
    assert.ok(
      bot.ok,
      `Merchant has ${beforeMerchant.xlm} XLM; need ${MERCHANT_XLM_FLOOR}. Friendbot HTTP ${bot.status}. Send 20 XLM from omnibus ${OMNIBUS_PUBLIC} to ${merchant.publicKey()}.`,
    );
  }
  assert.ok(
    beforeOmnibus.usdc >= Number(AMOUNT),
    `Omnibus has ${beforeOmnibus.usdc} USDC; need ${AMOUNT}. Run pnpm fund or the Circle faucet for ${OMNIBUS_PUBLIC}.`,
  );

  const payoutId = randomUUID();
  const memo = stellarMemoFromPayoutId(payoutId);
  const key1 = randomUUID();
  const lab = liveLabUrl();
  const body = {
    destination: "self",
    rail: "stellar",
    amount: Number(AMOUNT),
    currency_code: "USD",
    payout_id: payoutId,
  };

  const first = await fetchJson(`${lab}/demo/payouts`, {
    method: "POST",
    headers: labHeaders({
      "Content-Type": "application/json",
      "Idempotency-Key": key1,
    }),
    body: JSON.stringify(body),
  });
  const firstRow = asRecord(first.body);
  assert.ok(first.status < 400, `payout HTTP ${first.status}: ${first.text}`);
  const hash = String(firstRow.stellar_tx_hash ?? "");
  assert.ok(/^[a-f0-9]{64}$/.test(hash), `expected hash, got ${hash}`);

  const tx = await fetchJson(`${horizonUrl()}/transactions/${hash}`);
  const txRow = asRecord(tx.body);
  assert.equal(tx.status, 200);
  assert.equal(txRow.successful, true);
  assert.equal(txRow.memo, memo);
  assert.equal(txRow.memo_type, "text");

  const payments = await fetchJson(`${horizonUrl()}/transactions/${hash}/payments`);
  const records = (asRecord(payments.body)._embedded as { records?: unknown[] } | undefined)
    ?.records ?? [];
  const payment = records
    .map((row) => asRecord(row))
    .find((row) => row.type === "payment");
  assert.ok(payment, "expected a payment operation");
  assert.equal(payment.asset_code, "USDC");
  assert.equal(payment.asset_issuer, TESTNET_USDC_ISSUER);
  assert.equal(payment.asset_issuer, STELLAR_USDC_ISSUER);
  assert.equal(payment.from, OMNIBUS_PUBLIC);
  assert.equal(payment.to, MERCHANT_PUBLIC);
  assert.equal(Number(payment.amount), Number(AMOUNT));

  const replaySame = await fetchJson(`${lab}/demo/payouts`, {
    method: "POST",
    headers: labHeaders({
      "Content-Type": "application/json",
      "Idempotency-Key": key1,
    }),
    body: JSON.stringify(body),
  });
  const replayOther = await fetchJson(`${lab}/demo/payouts`, {
    method: "POST",
    headers: labHeaders({
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    }),
    body: JSON.stringify(body),
  });
  assert.equal(asRecord(replaySame.body).stellar_tx_hash, hash);
  assert.equal(asRecord(replayOther.body).stellar_tx_hash, hash);

  const history = await fetchJson(
    `${horizonUrl()}/accounts/${OMNIBUS_PUBLIC}/transactions?order=desc&limit=50`,
  );
  const txs =
    (asRecord(history.body)._embedded as { records?: unknown[] } | undefined)
      ?.records ?? [];
  const matching = txs
    .map((row) => asRecord(row))
    .filter((row) => row.memo === memo);
  assert.equal(
    matching.length,
    1,
    `expected one chain payment with memo ${memo}, found ${matching.length}`,
  );

  const detail = await fetchJson(`${lab}/demo/payouts/${payoutId}`);
  const detailRow = asRecord(detail.body);
  const reconcile = asRecord(detailRow.reconcile);
  assert.equal(reconcile.ok, true, `reconcile ${JSON.stringify(reconcile)}`);

  await sendUsdcPayment(
    new LocalKeypairSigner(merchant),
    OMNIBUS_PUBLIC,
    AMOUNT,
    "lab-live-recycle",
  );

  const afterOmnibus = await account(OMNIBUS_PUBLIC);
  const afterMerchant = await account(merchant.publicKey());
  assert.equal(afterOmnibus.usdc, beforeOmnibus.usdc);
  assert.equal(afterMerchant.usdc, beforeMerchant.usdc);

  const feeStroops = Number(txRow.fee_charged ?? 100);
  assert.equal(feeStroops, 100);
  recordLiveProof({
    payoutId,
    memo,
    hash,
    explorer: explorerTx(hash),
    amountUsdc: AMOUNT,
    omnibusFeeStroops: feeStroops,
  });
});
