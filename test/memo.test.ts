import assert from "node:assert/strict";
import test from "node:test";
import {
  STELLAR_MEMO_MAX,
  memoMatchesPayoutId,
  stellarMemoFromPayoutId,
} from "../src/stellar/memo.js";

test("stellarMemoFromPayoutId truncates to 28 characters", () => {
  const payoutId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  assert.equal(payoutId.length > STELLAR_MEMO_MAX, true);
  const memo = stellarMemoFromPayoutId(payoutId);
  assert.equal(memo.length, STELLAR_MEMO_MAX);
  assert.equal(memo, payoutId.slice(0, 28));
  assert.equal(memoMatchesPayoutId(memo, payoutId), true);
  assert.equal(memoMatchesPayoutId("other", payoutId), false);
});

test("short payout ids pass through", () => {
  assert.equal(stellarMemoFromPayoutId("short-id"), "short-id");
});
