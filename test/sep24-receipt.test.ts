import assert from "node:assert/strict";
import test from "node:test";
import { renderSep24CreditReceipt } from "../src/anchor/sep24-receipt.js";

test("renderSep24CreditReceipt shows sandbox last mile and escapes HTML", () => {
  const html = renderSep24CreditReceipt({
    rail: "wave",
    amountXof: "1000",
    phone: "+2250700000000<script>",
    payoutId: "tx-1",
    kind: "withdraw",
    status: "sandbox",
    message: "Sandbox wave withdraw. No live mobile money.",
    createdAt: "2026-09-17T00:00:00.000Z",
  });
  assert.match(html, /Sandbox wave credit/);
  assert.match(html, /sandbox/);
  assert.match(html, /tx-1/);
  assert.doesNotMatch(html, /<script>/);
});
