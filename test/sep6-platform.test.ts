import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  driveSep6Once,
  planSep6Action,
  quotedSettlementAmount,
} from "../src/anchor/sep6-platform.js";
import { createSep38Quote, XOF_PER_EUR } from "../src/anchor/sep38.js";

function isolate(): void {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-sep6p-"));
  process.env.EUR_USD_RATE = "1";
  process.env.QUOTE_SPREAD_BPS = "0";
}

test("honored quote settles at the quoted buy amount", () => {
  isolate();
  const quote = createSep38Quote({
    sellAsset: "iso4217:XOF",
    buyAsset: "stellar:USDC",
    sellAmount: String(XOF_PER_EUR),
    ttlSeconds: 60,
  });
  const expected = (Number(quote.sellAmount) / Number(quote.price)).toFixed(7);
  assert.equal(quote.buyAmount, expected);
  assert.equal(quotedSettlementAmount(quote.id), quote.buyAmount);
  const action = planSep6Action({
    id: "tx1",
    kind: "deposit",
    status: "pending_anchor",
    quoteId: quote.id,
  });
  assert.equal(action.method, "notify_onchain_funds_sent");
  if (action.method === "notify_onchain_funds_sent") {
    assert.equal(action.amountOut, quote.buyAmount);
  }
});

test("expired quote is rejected and not sent", () => {
  isolate();
  const quote = createSep38Quote({
    sellAsset: "iso4217:XOF",
    buyAsset: "stellar:USDC",
    sellAmount: "1000",
    ttlSeconds: 0,
  });
  const action = planSep6Action({
    id: "tx2",
    kind: "deposit",
    status: "pending_anchor",
    quoteId: quote.id,
  });
  assert.equal(action.method, "notify_transaction_error");
});

test("withdraw waits for the inbound payment, then pays out off chain", () => {
  const waiting = planSep6Action({
    id: "tx3",
    kind: "withdrawal",
    status: "pending_user_transfer_start",
    amountIn: "10",
  });
  assert.equal(waiting.method, "wait");
  const done = planSep6Action({
    id: "tx3",
    kind: "withdrawal",
    status: "pending_anchor",
    amountIn: "10",
  });
  assert.equal(done.method, "notify_offchain_funds_sent");
});

test("on-chain send stays off unless the driver is enabled", async () => {
  const calls: string[] = [];
  const result = await driveSep6Once({
    sendEnabled: false,
    list: async () => [
      {
        id: "tx4",
        kind: "deposit",
        status: "pending_anchor",
        amountIn: "10",
      },
    ],
    rpc: async (method) => {
      calls.push(method);
      return { ok: true, detail: "ok" };
    },
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(result.skipped, ["tx4"]);
});
