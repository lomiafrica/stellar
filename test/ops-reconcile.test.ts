import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { upsertSettlement } from "../src/ledger/store.js";
import { runReconcile } from "../src/ops/reconcile-job.js";
import {
  closeReview,
  readReviewQueue,
  reconcileRunsSince,
} from "../src/ops/reconcile-store.js";

function isolate(): void {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-ops-"));
  delete process.env.ALERT_WEBHOOK_URL;
}

test("a ledger row with no chain stays in review across a later run", async () => {
  isolate();
  upsertSettlement({
    id: "row-1",
    organization_id: "00000000-0000-4000-8000-000000000001",
    environment: "test",
    payout_id: "payout-break",
    destination: "self",
    last_mile_rail: "wave",
    amount: 1,
    currency_code: "USD",
    amount_usdc: "1",
    memo: "payout-break",
    status: "completed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const first = await runReconcile();
  assert.equal(first.ok, false);
  assert.ok(first.payout_ids_with_breaks.includes("payout-break"));
  const open = readReviewQueue().find((item) => item.payout_id === "payout-break");
  assert.equal(open?.status, "open");

  const second = await runReconcile();
  assert.equal(second.ok, false);
  const still = readReviewQueue().find((item) => item.payout_id === "payout-break");
  assert.equal(still?.status, "open");
  assert.equal(still?.first_seen, open?.first_seen);

  const closed = closeReview("payout-break", "checked by hand");
  assert.equal(closed?.status, "closed");
  assert.ok(reconcileRunsSince(14).length >= 2);
});

test("empty ledger run is clean", async () => {
  isolate();
  const run = await runReconcile();
  assert.equal(run.ok, true);
  assert.equal(run.rows, 0);
});
