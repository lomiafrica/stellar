import { notifyAlert } from "../ops/alert.js";
import { createStellarPayout } from "./stellar-payout.service.js";
import type { CreateStellarPayoutInput } from "./types.js";

const queue: CreateStellarPayoutInput[] = [];
let active = 0;

function limit(): number {
  const raw = Number(process.env.PAYOUT_WORKER_CONCURRENCY ?? "4");
  return Number.isFinite(raw) && raw > 0 ? raw : 4;
}

function drain(): void {
  while (active < limit() && queue.length > 0) {
    const job = queue.shift();
    if (!job) return;
    active += 1;
    void createStellarPayout({ ...job, continue_owned: true })
      .catch((err) => {
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
