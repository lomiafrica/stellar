import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSep6Transfer } from "../src/anchor/sep6.js";
import { createSep38Quote } from "../src/anchor/sep38.js";

test("SEP-6 withdraw credits sandbox last mile", () => {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-sep6-"));
  const transfer = createSep6Transfer({
    kind: "withdraw",
    amount: "2500",
    rail: "mtn",
    phone: "+2250700000000",
  });
  assert.equal(transfer.lastMile.rail, "mtn");
  assert.equal(transfer.lastMile.status, "sandbox");
});

test("SEP-6 rejects an expired quote", () => {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-sep6-"));
  const quote = createSep38Quote({
    sellAsset: "iso4217:XOF",
    buyAsset: "stellar:USDC",
    sellAmount: "1000",
    ttlSeconds: 0,
  });
  assert.throws(
    () =>
      createSep6Transfer({
        kind: "deposit",
        amount: "1000",
        quoteId: quote.id,
      }),
    /expired/i,
  );
});
