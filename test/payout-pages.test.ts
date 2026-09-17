import assert from "node:assert/strict";
import test from "node:test";
import {
  renderPayoutListPage,
  renderPayoutPage,
} from "../src/payouts/payout-pages.js";
import type { ReconcileResult } from "../src/ledger/reconcile.js";
import type { StellarSettlementRecord } from "../src/ledger/store.js";

const HASH = "49e2a131c61d7b3e41e0b53b6a22cb98fe98fbf0fdeadfa2b1e4342ccf328ffe";

function settlement(
  patch: Partial<StellarSettlementRecord> = {},
): StellarSettlementRecord {
  return {
    id: "row-1",
    organization_id: "00000000-0000-4000-8000-000000000001",
    environment: "test",
    payout_id: "83e4aa27-e619-4d13-963c-9b49ce62a59f",
    destination: "self",
    last_mile_rail: "wave",
    amount: 10,
    currency_code: "USD",
    amount_usdc: "10",
    stellar_tx_hash: HASH,
    bridge_transfer_id: "bridge_mock_17d3dada",
    memo: "83e4aa27-e619-4d13-963c-9b49",
    status: "completed",
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    ...patch,
  };
}

function reconcile(patch: Partial<ReconcileResult> = {}): ReconcileResult {
  return {
    ok: true,
    payoutId: "83e4aa27-e619-4d13-963c-9b49ce62a59f",
    hash: HASH,
    onChainSuccess: true,
    memoMatch: true,
    ledgerFound: true,
    details: "Ledger row matches successful on-chain payment with memo.",
    ...patch,
  };
}

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

test("only the Stellar hop is real on a settled payout", () => {
  const html = renderPayoutPage({ row: settlement(), reconcile: null });
  assert.deepEqual(hops(html), [
    ["skip", "Merchant earns XOF"],
    ["skip", "Treasury buys USDC"],
    ["done", "Stellar pays the merchant"],
    ["skip", "Last mile to the merchant"],
  ]);
});

test("an unsettled payout claims no chain hop and links no explorer", () => {
  const html = renderPayoutPage({
    row: settlement({
      stellar_tx_hash: undefined,
      status: "pending",
      bridge_transfer_id: undefined,
    }),
    reconcile: null,
  });
  assert.deepEqual(hops(html)[2], ["skip", "Stellar pays the merchant"]);
  assert.match(html, /Payout not settled yet/);
  assert.doesNotMatch(html, /stellar\.expert/);
});

test("reconcile checks render per check, not as one verdict", () => {
  const html = renderPayoutPage({
    row: settlement(),
    reconcile: reconcile({ memoMatch: false, ok: false }),
  });
  const checks = hops(html).slice(4);
  assert.deepEqual(checks, [
    ["done", "Payment succeeded on the network"],
    ["skip", "Memo matches the payout id"],
    ["done", "Ledger row exists for this hash"],
    ["done", "Bridge transfer completed"],
  ]);
});

test("settled payout links the explorer and shows the memo prefix", () => {
  const html = renderPayoutPage({ row: settlement(), reconcile: reconcile() });
  assert.match(
    html,
    /https:\/\/stellar\.expert\/explorer\/testnet\/tx\/49e2a131/,
  );
  assert.match(html, /83e4aa27-e619-4d13-963c-9b49</);
  assert.match(html, /Wave Mobile Money/);
  assert.match(html, /status-ok">Completed</);
  assert.match(html, />Self</);
  assert.match(html, /class="tag lomi">in lomi\. api</);
  assert.match(html, /class="tag mock">mock</);
  assert.match(html, /class="tag chain">on chain</);
  assert.match(html, /class="tag pass">pass</);
  assert.match(html, /tip-bubble/);
  assert.match(html, /first 28 characters of the payout id/);
  assert.doesNotMatch(html, /Why the memo matters/);
});

test("failed reconcile checks are tagged fail", () => {
  const html = renderPayoutPage({
    row: settlement(),
    reconcile: reconcile({ memoMatch: false, ok: false }),
  });
  assert.match(html, /class="tag fail">fail</);
});

test("payout page escapes ledger values", () => {
  const html = renderPayoutPage({
    row: settlement({ payout_id: "tx-1<script>", memo: "tx-1<script>" }),
    reconcile: null,
  });
  assert.doesNotMatch(html, /tx-1<script>/);
});

test("empty ledger explains how to create a payout", () => {
  const html = renderPayoutListPage([]);
  assert.match(html, /No payouts on this instance yet/);
  assert.match(html, /rail&quot;:&quot;stellar/);
});

test("ledger list links every payout", () => {
  const html = renderPayoutListPage([
    settlement(),
    settlement({ payout_id: "row-2", stellar_tx_hash: undefined }),
  ]);
  assert.match(
    html,
    /href="\/demo\/payouts\/83e4aa27-e619-4d13-963c-9b49ce62a59f"/,
  );
  assert.match(html, /href="\/demo\/payouts\/row-2"/);
  assert.match(html, /no hash/);
  assert.match(html, /class="tag pass">Completed</);
});

test("raw settlement omits last-mile phone", () => {
  const html = renderPayoutPage({
    row: settlement({
      mock_offramp: {
        rail: "wave",
        phone: "+2250700000000",
        status: "credited",
      },
    }),
    reconcile: null,
  });
  assert.doesNotMatch(html, /\+2250700000000/);
});
