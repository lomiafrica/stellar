import { randomUUID } from "node:crypto";
import { readNumber, readString, type JsonObject } from "../json.js";
import { withNamedLock } from "../ledger/lock.js";
import { readJsonArray, writeJsonArray } from "../anchor/json-store.js";

const RUNS = "reconcile_runs.json";
const REVIEW = "reconcile_review.json";

export interface ReconcileRunRecord {
  run_id: string;
  at: string;
  rows: number;
  ok: boolean;
  breaks: string[];
  payout_ids_with_breaks: string[];
}

export type ReviewStatus = "open" | "closed";

export interface ReviewItem {
  payout_id: string;
  breaks: string[];
  first_seen: string;
  last_seen: string;
  status: ReviewStatus;
  note: string;
}

function asRun(row: JsonObject): ReconcileRunRecord {
  const breaks = row.breaks;
  const ids = row.payout_ids_with_breaks;
  return {
    run_id: readString(row, "run_id") ?? "",
    at: readString(row, "at") ?? "",
    rows: readNumber(row, "rows") ?? 0,
    ok: row.ok === true,
    breaks: Array.isArray(breaks)
      ? breaks.filter((item): item is string => typeof item === "string")
      : [],
    payout_ids_with_breaks: Array.isArray(ids)
      ? ids.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function asReview(row: JsonObject): ReviewItem {
  const breaks = row.breaks;
  const status = readString(row, "status");
  return {
    payout_id: readString(row, "payout_id") ?? "",
    breaks: Array.isArray(breaks)
      ? breaks.filter((item): item is string => typeof item === "string")
      : [],
    first_seen: readString(row, "first_seen") ?? "",
    last_seen: readString(row, "last_seen") ?? "",
    status: status === "closed" ? "closed" : "open",
    note: readString(row, "note") ?? "",
  };
}

function runToJson(run: ReconcileRunRecord): JsonObject {
  return {
    run_id: run.run_id,
    at: run.at,
    rows: run.rows,
    ok: run.ok,
    breaks: run.breaks,
    payout_ids_with_breaks: run.payout_ids_with_breaks,
  };
}

function reviewToJson(item: ReviewItem): JsonObject {
  return {
    payout_id: item.payout_id,
    breaks: item.breaks,
    first_seen: item.first_seen,
    last_seen: item.last_seen,
    status: item.status,
    note: item.note,
  };
}

export function readReconcileRuns(): ReconcileRunRecord[] {
  return readJsonArray(RUNS).map(asRun);
}

export function latestReconcileRun(): ReconcileRunRecord | undefined {
  const runs = readReconcileRuns();
  return runs[runs.length - 1];
}

export function reconcileRunsSince(
  days: number,
  now = Date.now(),
): ReconcileRunRecord[] {
  const windowMs = (Number.isFinite(days) && days > 0 ? days : 14) * 86_400_000;
  const cutoff = now - windowMs;
  return readReconcileRuns().filter((run) => {
    const at = Date.parse(run.at);
    return Number.isFinite(at) && at >= cutoff;
  });
}

export function appendReconcileRun(
  input: Omit<ReconcileRunRecord, "run_id" | "at"> & { at?: string },
): ReconcileRunRecord {
  const run: ReconcileRunRecord = {
    run_id: randomUUID(),
    at: input.at ?? new Date().toISOString(),
    rows: input.rows,
    ok: input.ok,
    breaks: input.breaks,
    payout_ids_with_breaks: input.payout_ids_with_breaks,
  };
  withNamedLock("reconcile-runs", () => {
    const rows = readJsonArray(RUNS);
    rows.push(runToJson(run));
    writeJsonArray(RUNS, rows);
  });
  return run;
}

export function readReviewQueue(): ReviewItem[] {
  return readJsonArray(REVIEW).map(asReview);
}

/** A break stays open until a person closes it. A later clean run does not close it. */
export function touchReview(
  payoutId: string,
  breaks: string[],
  now = new Date().toISOString(),
): ReviewItem {
  return withNamedLock("reconcile-review", () => {
    const rows = readJsonArray(REVIEW).map(asReview);
    const idx = rows.findIndex((item) => item.payout_id === payoutId);
    const existing = idx >= 0 ? rows[idx] : undefined;
    const next: ReviewItem = {
      payout_id: payoutId,
      breaks,
      first_seen: existing?.first_seen || now,
      last_seen: now,
      status: "open",
      note: existing?.note ?? "",
    };
    if (idx >= 0) rows[idx] = next;
    else rows.push(next);
    writeJsonArray(REVIEW, rows.map(reviewToJson));
    return next;
  });
}

export function closeReview(
  payoutId: string,
  note: string,
): ReviewItem | undefined {
  return withNamedLock("reconcile-review", () => {
    const rows = readJsonArray(REVIEW).map(asReview);
    const idx = rows.findIndex((item) => item.payout_id === payoutId);
    const existing = idx >= 0 ? rows[idx] : undefined;
    if (!existing) return undefined;
    const next: ReviewItem = {
      ...existing,
      status: "closed",
      note,
      last_seen: new Date().toISOString(),
    };
    rows[idx] = next;
    writeJsonArray(REVIEW, rows.map(reviewToJson));
    return next;
  });
}
