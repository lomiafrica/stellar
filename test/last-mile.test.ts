import assert from "node:assert/strict";
import test from "node:test";
import { dispatchLastMile } from "../src/anchor/last-mile.js";

test("dispatchLastMile keeps Wave / MTN / SPI shape", () => {
  const wave = dispatchLastMile({
    rail: "wave",
    amountXof: "1000",
    phone: "+2250700000000",
    payoutId: "p1",
    kind: "withdraw",
  });
  assert.equal(wave.rail, "wave");
  assert.equal(wave.status, "sandbox");
  assert.match(wave.message, /No live mobile money/);

  const mtn = dispatchLastMile({
    rail: "mtn",
    amountXof: "500",
    phone: "+2250700000000",
    payoutId: "p2",
    kind: "deposit",
  });
  assert.equal(mtn.rail, "mtn");
  assert.equal(mtn.kind, "deposit");
});
