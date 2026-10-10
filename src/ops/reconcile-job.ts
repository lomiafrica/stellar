import { readLedger, type StellarSettlementRecord } from "../ledger/store.js";
import { reconcileThreeWay } from "../ledger/reconcile.js";
import { notifyAlert } from "./alert.js";
import { log } from "./log.js";
import {
  appendReconcileRun,
  touchReview,
  type ReconcileRunRecord,
} from "./reconcile-store.js";

const STUCK_MS = 180_000;

function shouldCheck(row: StellarSettlementRecord, now: number): boolean {
  if (row.status === "pending") return false;
  if (row.status === "failed" && !row.stellar_tx_hash) return false;
  if (row.status === "processing") {
    const updated = Date.parse(row.updated_at || row.created_at);
    if (Number.isFinite(updated) && now - updated < STUCK_MS) return false;
  }
  return row.status === "completed" || row.status === "processing" || Boolean(row.stellar_tx_hash);
}

/** Ledger vs chain vs Bridge for every settled row. Breaks go to the review queue. */
export async function runReconcile(now = Date.now()): Promise<ReconcileRunRecord> {
  const rows = readLedger().filter((row) => shouldCheck(row, now));
  const breakLines: string[] = [];
  const payoutIds: string[] = [];

  for (const row of rows) {
    const result = await reconcileThreeWay(row.payout_id);
    if (result.ok) continue;
    payoutIds.push(row.payout_id);
    const codes = result.breaks.map((code) => `${row.payout_id}:${code}`);
    breakLines.push(...codes);
    touchReview(row.payout_id, result.breaks, new Date(now).toISOString());
    await notifyAlert("reconcile.break", {
      payout_id: row.payout_id,
      breaks: result.breaks.join(","),
    });
  }

  const run = appendReconcileRun({
    at: new Date(now).toISOString(),
    rows: rows.length,
    ok: payoutIds.length === 0,
    breaks: breakLines,
    payout_ids_with_breaks: payoutIds,
  });
  log("reconcile.run", {
    run_id: run.run_id,
    rows: run.rows,
    ok: run.ok,
    breaks: run.breaks.length,
  });
  return run;
}

let timer: ReturnType<typeof setInterval> | undefined;

/** In-process schedule. The daily GitHub workflow is the clock while Railway sleeps the lab. */
export function startReconcileSchedule(): void {
  if (timer) return;
  const hours = Number(process.env.RECONCILE_CRON_HOURS ?? "24");
  const span = (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3_600_000;
  timer = setInterval(() => {
    void runReconcile().catch((err) => {
      log("reconcile.run", {
        ok: false,
        message: err instanceof Error ? err.message : "reconcile failed",
      });
    });
  }, span);
  timer.unref?.();
}
