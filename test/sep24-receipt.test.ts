import assert from "node:assert/strict";
import test from "node:test";
import {
  moneyPathHtml,
  renderSep24CreditReceipt,
  renderSep24FlowPage,
  renderSep24Interactive,
} from "../src/anchor/sep24-pages.js";

test("deposit path lists Wave before the wallet", () => {
  const html = moneyPathHtml({ kind: "deposit", rail: "wave", mode: "form" });
  const wave = html.indexOf("Wave takes CFA");
  const wallet = html.indexOf("Wallet receives USDC");
  assert.ok(wave >= 0 && wallet > wave);
});

test("withdraw path lists the wallet before Wave", () => {
  const html = moneyPathHtml({
    kind: "withdraw",
    rail: "wave",
    mode: "receipt",
  });
  const wallet = html.indexOf("Wallet sends USDC");
  const wave = html.indexOf("Wave pays the phone");
  assert.ok(wallet >= 0 && wave > wallet);
});

/** [mark, title] for each hop, in page order. */
function hops(html: string): [string, string][] {
  return html
    .split("<li ")
    .slice(1)
    .map((chunk) => [
      /class="(\w+)"/.exec(chunk)?.[1] ?? "",
      /step-title">([^<]*)/.exec(chunk)?.[1] ?? "",
    ]);
}

test("receipt marks the mobile money hop, not the wallet hop", () => {
  assert.deepEqual(
    hops(moneyPathHtml({ kind: "withdraw", rail: "wave", mode: "receipt" })),
    [
      ["skip", "Wallet sends USDC"],
      ["skip", "Anchor converts"],
      ["done", "Wave pays the phone"],
    ],
  );
  assert.deepEqual(
    hops(moneyPathHtml({ kind: "deposit", rail: "mtn", mode: "receipt" })),
    [
      ["done", "MTN takes CFA"],
      ["skip", "Anchor converts"],
      ["skip", "Wallet receives USDC"],
    ],
  );
});

test("flow page keeps Wave last mile apart from Stellar payments", () => {
  const html = renderSep24FlowPage();
  assert.match(html, /How the money moves/);
  assert.match(html, /does not create a Stellar payment/);
  assert.doesNotMatch(html, /stellar\.expert/i);
});

test("interactive form posts plain HTML with no script", () => {
  const html = renderSep24Interactive({
    kind: "deposit",
    amount: "1000",
    token: "t.ok",
    transactionId: "tx-1",
  });
  assert.match(html, /Sandbox deposit/);
  assert.match(html, /id="pay-form"/);
  assert.match(html, /action="\/anchor\/sep24\/deposit"/);
  assert.doesNotMatch(html, /<script/i);
});

test("renderSep24CreditReceipt shows sandbox last mile and escapes HTML", () => {
  const html = renderSep24CreditReceipt({
    rail: "wave",
    amountXof: "1000",
    phone: "+2250700000000<script>",
    payoutId: "tx-1",
    kind: "withdraw",
    status: "sandbox",
    message: "No live mobile money. wave sandbox only.",
    createdAt: "2026-09-17T00:00:00.000Z",
  });
  assert.match(html, /sandbox/);
  assert.match(html, /tx-1/);
  assert.match(html, /1000/);
  assert.match(html, /not a Stellar payment/);
  assert.doesNotMatch(html, /\+2250700000000<script>/);
  assert.doesNotMatch(html, /stellar\.expert/i);
});
