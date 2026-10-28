import { findByPayoutId, upsertSettlement } from "../ledger/store.js";
import { notifyAlert } from "../ops/alert.js";
import { PayoutInFlightError } from "./errors.js";
import { createStellarPayout } from "./stellar-payout.service.js";
import type { CreateStellarPayoutInput } from "./types.js";

const queue: CreateStellarPayoutInput[] = [];
let active = 0;

function limit(): number {
  const raw = Number(process.env.PAYOUT_WORKER_CONCURRENCY ?? "4");
  return Number.isFinite(raw) && raw > 0 ? raw : 4;
}

/** A claim that never built a transaction moved no money, so it fails now instead of waiting for reconcile. */
function failUnbuilt(payoutId: string | undefined, err: unknown): void {
  if (!payoutId || err instanceof PayoutInFlightError) return;
  const row = findByPayoutId(payoutId);
  if (row?.status === "processing" && !row.stellar_tx_hash) {
    upsertSettlement({ ...row, status: "failed" });
  }
}

function drain(): void {
  while (active < limit() && queue.length > 0) {
    const job = queue.shift();
    if (!job) return;
    active += 1;
    void createStellarPayout({ ...job, continue_owned: true })
      .catch((err) => {
        failUnbuilt(job.payout_id, err);
        void notifyAlert("tx.send_error", {
          payout_id: job.payout_id ?? "",
          message: err instanceof Error ? err.message : "worker failed",
        });
      })
      .finally(() => {
        active -= 1;
        drain();
      });
  }
}

export function enqueuePayout(input: CreateStellarPayoutInput): void {
  queue.push(input);
  drain();
}

export function payoutQueueDepth(): number {
  return queue.length + active;
}
