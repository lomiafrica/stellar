import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertQuoteUsable,
  createSep38Quote,
  XOF_PER_EUR,
} from "../src/anchor/sep38.js";

test("SEP-38 quote has a TTL and rejects expiry", async () => {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-sep38-"));
  process.env.EUR_USD_RATE = "1";
  process.env.QUOTE_SPREAD_BPS = "0";
  const quote = createSep38Quote({
    sellAsset: "iso4217:XOF",
    buyAsset: "stellar:USDC",
    sellAmount: String(XOF_PER_EUR),
    ttlSeconds: 60,
  });
  assert.ok(Number(quote.buyAmount) > 0);
  assert.equal(assertQuoteUsable(quote.id).id, quote.id);

  const expired = createSep38Quote({
    sellAsset: "iso4217:XOF",
    buyAsset: "stellar:USDC",
    sellAmount: "1000",
    ttlSeconds: 0,
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.throws(() => assertQuoteUsable(expired.id), /expired/i);
});
