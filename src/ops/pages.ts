import { escapeHtml, idHtml, shell } from "../http/page-chrome.js";
import type { ReconcileRunRecord, ReviewItem } from "./reconcile-store.js";

function runLine(run: ReconcileRunRecord): string {
  const mark = run.ok ? "pass" : "fail";
  const label = run.ok ? "clean" : "break";
  return `<li><div class="step-head"><span class="step-title">${escapeHtml(run.at)}</span><span class="tag ${mark}">${label}</span></div><span class="step-copy">${run.rows} rows, ${run.breaks.length} breaks</span></li>`;
}

export function renderReconcilePage(input: {
  title: string;
  lede: string;
  latest?: ReconcileRunRecord;
  runs: ReconcileRunRecord[];
  review: ReviewItem[];
}): string {
  const latest = input.latest
    ? `<p class="${input.latest.ok ? "status-ok" : "status-bad"}">${input.latest.ok ? "Latest run is clean." : "Latest run has breaks."}</p><p class="note">Run ${escapeHtml(input.latest.run_id)} at ${escapeHtml(input.latest.at)}. ${input.latest.rows} rows.</p>`
    : `<p class="note">No reconcile run yet.</p>`;
  const runs =
    input.runs.length === 0
      ? `<p class="note">No runs in this window.</p>`
      : `<ol class="path card">${input.runs.map(runLine).join("")}</ol>`;
  const open = input.review.filter((item) => item.status === "open");
  const review =
    open.length === 0
      ? `<p class="note">Review queue is empty. A break stays here until someone closes it.</p>`
      : `<ul class="rows card">${open
          .map(
            (item) =>
              `<li>${idHtml(item.payout_id)}<span class="step-copy">${escapeHtml(item.breaks.join(", "))} since ${escapeHtml(item.first_seen)}</span></li>`,
          )
          .join("")}</ul>`;
  return shell(
    input.title,
    `<p class="kicker">lomi. testnet lab</p><h1>${escapeHtml(input.title)}</h1><p class="lede">${escapeHtml(input.lede)}</p>${latest}<p class="kicker">Runs</p>${runs}<p class="kicker">Review queue</p>${review}`,
  );
}
