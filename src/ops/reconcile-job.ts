import {
  readLedger,
  upsertSettlement,
  type StellarSettlementRecord,
} from "../ledger/store.js";
import {
  chainNeverLanded,
  reconcileThreeWay,
  type ChainSources,
} from "../ledger/reconcile.js";
import { notifyAlert } from "./alert.js";
import { log } from "./log.js";
import {
  appendReconcileRun,
  touchReview,
  type ReconcileRunRecord,
} from "./reconcile-store.js";

const STUCK_MS = 180_000;
// Payments are built with a 180s timeout; the extra minute covers ledger close.
const SEND_EXPIRED_MS = 240_000;

function shouldCheck(row: StellarSettlementRecord, now: number): boolean {
  if (row.status === "pending") return false;
  if (row.status === "failed" && !row.stellar_tx_hash) return false;
  const updated = Date.parse(row.updated_at || row.created_at);
  if (Number.isFinite(updated) && now - updated < STUCK_MS) return false;
  return (
    row.status === "completed" ||
    row.status === "processing" ||
    Boolean(row.stellar_tx_hash)
  );
}

/**
 * A claim with no hash past the stuck window never built a transaction,
 * so no leg moved money. It is failed, alerted, and left out of the breaks.
 */
async function failAbandonedClaims(now: number): Promise<void> {
  for (const row of readLedger()) {
    if (row.status !== "processing" || row.stellar_tx_hash) continue;
    const updated = Date.parse(row.updated_at || row.created_at);
    if (!Number.isFinite(updated) || now - updated < STUCK_MS) continue;
    upsertSettlement({ ...row, status: "failed" });
    await notifyAlert("payout.abandoned", {
      payout_id: row.payout_id,
      claimed_at: row.updated_at || row.created_at,
    });
  }
}

/**
 * A built payment that is unknown to the network after its time bounds can
 * never land, so the row is failed and alerted rather than reported as a break.
 */
async function failExpiredSends(
  now: number,
  chain?: ChainSources,
): Promise<Set<string>> {
  const failed = new Set<string>();
  for (const row of readLedger()) {
    if (row.status !== "processing" || !row.stellar_tx_hash) continue;
    const updated = Date.parse(row.updated_at || row.created_at);
    if (!Number.isFinite(updated) || now - updated < SEND_EXPIRED_MS) continue;
    if (!(await chainNeverLanded(row.stellar_tx_hash, chain))) continue;
    upsertSettlement({ ...row, status: "failed" });
    failed.add(row.payout_id);
    await notifyAlert("payout.expired", {
      payout_id: row.payout_id,
      hash: row.stellar_tx_hash,
    });
  }
  return failed;
}

/** Ledger vs chain vs Bridge for every settled row. Breaks go to the review queue. */
export async function runReconcile(
  now = Date.now(),
  chain?: ChainSources,
): Promise<ReconcileRunRecord> {
  await failAbandonedClaims(now);
  const expired = await failExpiredSends(now, chain);
  const rows = readLedger().filter(
    (row) => !expired.has(row.payout_id) && shouldCheck(row, now),
  );
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
