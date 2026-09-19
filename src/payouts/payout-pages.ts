import { explorerTx } from "../config.js";
import {
  definitionsHtml,
  escapeHtml,
  shell,
  stepsHtml,
  type PageStep,
  type TagTone,
} from "../http/page-chrome.js";
import type { ReconcileResult, ThreeWayResult } from "../ledger/reconcile.js";
import type {
  LastMileRail,
  PayoutDestination,
  PayoutStatus,
  StellarSettlementRecord,
} from "../ledger/store.js";
import {
  memoMatchesPayoutId,
  stellarMemoFromPayoutId,
} from "../stellar/memo.js";

const LAST_MILE = {
  wave: "Wave Mobile Money",
  mtn: "MTN Mobile Money",
  spi: "SPI",
  bank: "Bank",
} as const satisfies Record<LastMileRail, string>;

const DESTINATION = {
  self: "Self",
  beneficiary: "Beneficiary",
} as const satisfies Record<PayoutDestination, string>;

const STATUS = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
} as const satisfies Record<PayoutStatus, string>;

function humanLastMile(rail: LastMileRail): string {
  return LAST_MILE[rail] ?? titleCase(rail);
}

function humanDestination(destination: PayoutDestination): string {
  return DESTINATION[destination] ?? titleCase(destination);
}

function humanStatus(status: PayoutStatus): string {
  return STATUS[status] ?? titleCase(status);
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function statusTone(status: PayoutStatus): TagTone {
  if (status === "completed") return "pass";
  if (status === "failed") return "fail";
  return "lomi";
}

function statusClass(status: PayoutStatus): string {
  if (status === "completed") return "status-ok";
  if (status === "failed") return "status-bad";
  return "status-wait";
}

function statusHtml(status: PayoutStatus): string {
  return `<span class="${statusClass(status)}">${escapeHtml(humanStatus(status))}</span>`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = d.getUTCDate();
  const month = months[d.getUTCMonth()] ?? "";
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hh}:${mm} UTC`;
}

function shortAccount(value?: string): string {
  if (!value) return "";
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function memoTip(payoutId: string): string {
  const memo = stellarMemoFromPayoutId(payoutId);
  return `A Stellar text memo holds 28 bytes, so we put the first 28 characters of the payout id in it: ${memo}. That makes every payment on chain reconcilable against one payout row without a shared database. Sending the same payout id twice settles once.`;
}

/**
 * Hops a payout takes. Only the Stellar hop happens in this lab: collection and
 * last mile live in the private lomi. API, and Bridge is a mock adapter.
 */
function payoutSteps(row: StellarSettlementRecord): PageStep[] {
  const settled = Boolean(row.stellar_tx_hash);
  return [
    {
      title: "Merchant earns XOF",
      tag: "in lomi. api",
      tone: "lomi",
      copy: "Collected by Wave, MTN, SPI or card, then credited to the merchant ledger. Not in this lab.",
      mark: "skip",
    },
    {
      title: "Treasury buys USDC",
      tag: "mock",
      tone: "mock",
      copy: row.bridge_transfer_id
        ? `Bridge is a mock adapter here, so no dollars moved. Stub id ${row.bridge_transfer_id}.`
        : "Bridge is a mock adapter here. No dollars moved.",
      mark: "skip",
    },
    {
      title: "Stellar pays the merchant",
      tag: settled ? "on chain" : "not submitted",
      tone: settled ? "chain" : "fail",
      copy: settled
        ? "Omnibus account paid the merchant custodial account in USDC, with the payout id as the memo. This hop is real."
        : "No transaction hash on this payout yet, so nothing was submitted to the network.",
      mark: settled ? "done" : "skip",
    },
    {
      title: "Last mile to the merchant",
      tag: "in lomi. api",
      tone: "lomi",
      copy: `Would land via ${humanLastMile(row.last_mile_rail)}. Not in this lab.`,
      mark: "skip",
    },
  ];
}

function reconcileSteps(
  row: StellarSettlementRecord,
  reconcile: ReconcileResult,
  threeWay?: ThreeWayResult | null,
): PageStep[] {
  const memoOk = memoMatchesPayoutId(row.memo, row.payout_id);
  const bridgeOk = threeWay
    ? !threeWay.breaks.includes("bridge_incomplete")
    : Boolean(row.bridge_transfer_id);
  const steps: PageStep[] = [
    {
      title: "Payment succeeded on the network",
      tag: reconcile.onChainSuccess ? "pass" : "fail",
      tone: reconcile.onChainSuccess ? "pass" : "fail",
      copy: reconcile.onChainSuccess
        ? "The network was asked for this hash and reports a successful transaction."
        : "The network does not report this hash as successful.",
      mark: reconcile.onChainSuccess ? "done" : "skip",
    },
    {
      title: "Memo matches the payout id",
      tag: reconcile.memoMatch && memoOk ? "pass" : "fail",
      tone: reconcile.memoMatch && memoOk ? "pass" : "fail",
      copy: `Memo is the first 28 characters of the payout id, so a payment on chain can be traced back to one payout and only one.`,
      mark: reconcile.memoMatch && memoOk ? "done" : "skip",
    },
    {
      title: "Ledger row exists for this hash",
      tag: reconcile.ledgerFound ? "pass" : "fail",
      tone: reconcile.ledgerFound ? "pass" : "fail",
      copy: reconcile.ledgerFound
        ? "The hash resolves to a row in the settlement ledger."
        : "No ledger row claims this hash.",
      mark: reconcile.ledgerFound ? "done" : "skip",
    },
    {
      title: "Bridge transfer completed",
      tag: bridgeOk ? "mock" : "fail",
      tone: bridgeOk ? "mock" : "fail",
      copy: bridgeOk
        ? "Treasury hop is a mock adapter here. The id is on the settlement row."
        : "No completed Bridge transfer on this payout.",
      mark: bridgeOk ? "done" : "skip",
    },
  ];
  return steps;
}

function headline(row: StellarSettlementRecord): string {
  if (row.stellar_tx_hash) return "Payout settled on Stellar";
  if (row.status === "failed") return "Payout failed before settlement";
  return "Payout not settled yet";
}

function hashHtml(hash: string): string {
  const short =
    hash.length > 20 ? `${hash.slice(0, 12)}…${hash.slice(-6)}` : hash;
  return `<a href="${escapeHtml(explorerTx(hash))}">${escapeHtml(short)}</a>`;
}

/** Detail page: payout id, memo, on-chain hash, and the reconcile verdict. */
export function renderPayoutPage(input: {
  row: StellarSettlementRecord;
  reconcile: ReconcileResult | null;
  threeWay?: ThreeWayResult | null;
}): string {
  const { row, reconcile, threeWay } = input;
  const hash = row.stellar_tx_hash ?? "";
  const verdict = reconcile
    ? `<p class="kicker">Reconcile</p>
    <p class="note">${escapeHtml(reconcile.details)}</p>
    ${stepsHtml(reconcileSteps(row, reconcile, threeWay), "Reconcile checks")}`
    : "";
  return shell(
    `Payout ${row.payout_id}`,
    `
    <p class="kicker">${escapeHtml(titleCase(row.environment))} · ${escapeHtml(humanStatus(row.status))}</p>
    <h1>${escapeHtml(headline(row))}</h1>
    <p class="lede">lomi. paying a merchant. The Stellar hop replaces the correspondent bank leg between XOF collected in UEMOA and dollars the merchant can hold.</p>
    ${definitionsHtml([
      { key: "Status", value: statusHtml(row.status), html: true },
      { key: "Destination", value: humanDestination(row.destination) },
      { key: "Last mile rail", value: humanLastMile(row.last_mile_rail) },
      { key: "Payout id", value: row.payout_id },
      { key: "Memo", value: row.memo, tip: memoTip(row.payout_id) },
      { key: "Amount", value: `${row.amount} ${row.currency_code}` },
      { key: "USDC sent", value: `${row.amount_usdc} USDC` },
      { key: "Created", value: formatWhen(row.created_at) },
      ...(hash ? [{ key: "Hash", value: hashHtml(hash), html: true }] : []),
      ...(row.stellar_from
        ? [{ key: "From", value: shortAccount(row.stellar_from) }]
        : []),
      ...(row.stellar_to
        ? [{ key: "To", value: shortAccount(row.stellar_to) }]
        : []),
      ...(row.bridge_transfer_id
        ? [{ key: "Bridge", value: row.bridge_transfer_id }]
        : []),
    ])}
    <p class="kicker">What ran</p>
    ${stepsHtml(payoutSteps(row), "Payout hops")}
    ${verdict}
    <details class="raw"><summary>Raw settlement</summary><pre>${escapeHtml(JSON.stringify({ ...row, mock_offramp: row.mock_offramp ? { rail: row.mock_offramp.rail, status: row.mock_offramp.status } : undefined }, null, 2))}</pre></details>
    `,
  );
}

function payoutRow(row: StellarSettlementRecord): string {
  const hash = row.stellar_tx_hash
    ? `${row.stellar_tx_hash.slice(0, 12)}…`
    : "no hash";
  return `<li><div class="step-head"><span class="step-title"><a href="/demo/payouts/${escapeHtml(row.payout_id)}">${escapeHtml(row.payout_id)}</a></span><span class="tag ${statusTone(row.status)}">${escapeHtml(humanStatus(row.status))}</span></div><span class="step-copy">${escapeHtml(`${row.amount} ${row.currency_code} · ${row.amount_usdc} USDC · ${hash}`)}</span></li>`;
}

const CREATE_HINT = `curl -X POST $LAB/demo/payouts \\
  -H 'Content-Type: application/json' \\
  -H "X-Lab-Key: $LAB_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"destination":"self","rail":"stellar","amount":10,"currency_code":"USD"}'`;

/** List page: every settlement row this lab instance has written. */
export function renderPayoutListPage(rows: StellarSettlementRecord[]): string {
  const body = rows.length
    ? `<ol class="rows card">${rows.map(payoutRow).join("")}</ol>`
    : `<p class="note">No payouts on this instance yet. The ledger is a local file, so it is empty after every deploy. Create one:</p>
    <pre>${escapeHtml(CREATE_HINT)}</pre>`;
  return shell(
    "Payout ledger",
    `
    <p class="kicker">Testnet</p>
    <h1>Payout ledger</h1>
    <p class="lede">Every payout this lab settled on Stellar. This is the direction of money lomi. sells: lomi. paying a merchant. Unlike the SEP-24 sandbox, the Stellar hop here is a real payment on the network.</p>
    ${body}
    `,
  );
}
