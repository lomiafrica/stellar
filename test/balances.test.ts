import assert from "node:assert/strict";
import test from "node:test";
import { amountsFromHorizonBalances } from "../src/cli/balances.js";
import { visibleWidth } from "../src/cli/talk.js";
import { STELLAR_USDC_ISSUER } from "../src/config.js";

test("amountsFromHorizonBalances reads XLM and Circle USDC", () => {
  const amounts = amountsFromHorizonBalances([
    { asset_type: "native", balance: "9994.9999500" },
    {
      asset_type: "credit_alphanum4",
      asset_code: "USDC",
      asset_issuer: STELLAR_USDC_ISSUER,
      balance: "10.0000000",
    },
  ]);
  assert.equal(amounts.xlm, 9994.99995);
  assert.equal(amounts.usdc, 10);
  assert.equal(amounts.hasUsdcTrustline, true);
});

test("amountsFromHorizonBalances ignores other credit assets", () => {
  const amounts = amountsFromHorizonBalances([
    { asset_type: "native", balance: "5" },
    {
      asset_type: "credit_alphanum4",
      asset_code: "USDC",
      asset_issuer: "GOTHERISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      balance: "99",
    },
  ]);
  assert.equal(amounts.xlm, 5);
  assert.equal(amounts.usdc, 0);
  assert.equal(amounts.hasUsdcTrustline, false);
});

test("visibleWidth ignores ANSI color codes", () => {
  assert.equal(visibleWidth("hello"), 5);
  assert.equal(visibleWidth("\u001b[32mhello\u001b[0m"), 5);
});
