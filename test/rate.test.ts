import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildSep38Rate, platformPrice } from "../src/anchor/rate.js";
import { XOF_PER_EUR } from "../src/anchor/sep38.js";

function isolate(): void {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-rate-"));
  process.env.EUR_USD_RATE = "1";
  process.env.QUOTE_SPREAD_BPS = "0";
}

test("indicative rate has no id and firm rate honors price times buy", () => {
  isolate();
  const indicative = buildSep38Rate({
    type: "indicative",
    sellAsset: "iso4217:XOF",
    buyAsset: "stellar:USDC",
    sellAmount: String(XOF_PER_EUR),
  });
  assert.equal(indicative.rate.id, undefined);
  assert.equal(indicative.rate.expires_at, undefined);

  const firm = buildSep38Rate({
    type: "firm",
    sellAsset: "iso4217:XOF",
    buyAsset: "stellar:USDC",
    sellAmount: String(XOF_PER_EUR),
  });
  assert.ok(firm.rate.id?.startsWith("q_"));
  assert.ok(firm.rate.expires_at);
  const sell = Number(firm.rate.sell_amount);
  const buy = Number(firm.rate.buy_amount);
  const price = Number(firm.rate.price);
  assert.ok(Math.abs(sell - price * buy) < 1);
  assert.equal(firm.rate.price, platformPrice("iso4217:XOF", "stellar:USDC"));
});

test("USDC sell uses the inverse price", () => {
  isolate();
  const firm = buildSep38Rate({
    type: "firm",
    sellAsset: "stellar:USDC",
    buyAsset: "iso4217:XOF",
    sellAmount: "1",
  });
  const sell = Number(firm.rate.sell_amount);
  const buy = Number(firm.rate.buy_amount);
  const price = Number(firm.rate.price);
  assert.ok(Math.abs(sell - price * buy) < 0.01);
  assert.ok(price < 1);
});
