import { explorerTx } from "../config.js";
import {
  definitionsHtml,
  escapeHtml,
  shell,
  stepsHtml,
  type PageStep,
} from "../http/page-chrome.js";
import type { ReconcileResult, ThreeWayResult } from "../ledger/reconcile.js";
import type { StellarSettlementRecord } from "../ledger/store.js";
import { memoMatchesPayoutId, stellarMemoFromPayoutId } from "../stellar/memo.js";

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
      copy: "Collected by Wave, MTN, SPI or card, then credited to the merchant ledger. Not in this lab.",
      mark: "skip",
    },
    {
      title: "Treasury buys USDC",
      tag: "mock",
      copy: row.bridge_transfer_id
        ? `Bridge is a mock adapter here, so no dollars moved. Stub id ${row.bridge_transfer_id}.`
        : "Bridge is a mock adapter here. No dollars moved.",
      mark: "skip",
    },
    {
      title: "Stellar pays the merchant",
      tag: settled ? "on chain" : "not submitted",
      copy: settled
        ? "Omnibus account paid the merchant custodial account in USDC, with the payout id as the memo. This hop is real."
        : "No transaction hash on this payout yet, so nothing was submitted to the network.",
      mark: settled ? "done" : "skip",
    },
    {
      title: "Last mile to the merchant",
      tag: "in lomi. api",
      copy: `Would land via ${row.last_mile_rail}. Not in this lab.`,
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
      copy: reconcile.onChainSuccess
        ? "The network was asked for this hash and reports a successful transaction."
        : "The network does not report this hash as successful.",
      mark: reconcile.onChainSuccess ? "done" : "skip",
    },
    {
      title: "Memo matches the payout id",
      tag: reconcile.memoMatch && memoOk ? "pass" : "fail",
      copy: `Memo is the first 28 characters of the payout id, so a payment on chain can be traced back to one payout and only one.`,
      mark: reconcile.memoMatch && memoOk ? "done" : "skip",
    },
    {
      title: "Ledger row exists for this hash",
      tag: reconcile.ledgerFound ? "pass" : "fail",
      copy: reconcile.ledgerFound
        ? "The hash resolves to a row in the settlement ledger."
        : "No ledger row claims this hash.",
      mark: reconcile.ledgerFound ? "done" : "skip",
    },
    {
      title: "Bridge transfer completed",
      tag: bridgeOk ? "mock" : "fail",
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

/** Detail page: payout id, memo, on-chain hash, and the reconcile verdict. */
export function renderPayoutPage(input: {
  row: StellarSettlementRecord;
  reconcile: ReconcileResult | null;
  threeWay?: ThreeWayResult | null;
}): string {
  const { row, reconcile, threeWay } = input;
  const hash = row.stellar_tx_hash ?? "";
  const explorer = hash
    ? `<p class="kicker">On chain</p>
    <p class="note"><a href="${escapeHtml(explorerTx(hash))}">${escapeHtml(hash)}</a></p>`
    : "";
  const verdict = reconcile
    ? `<p class="kicker">Reconcile</p>
    <p class="note">${escapeHtml(reconcile.details)}</p>
    ${stepsHtml(reconcileSteps(row, reconcile, threeWay), "Reconcile checks")}`
    : "";
  return shell(
    `Payout ${row.payout_id}`,
    `
    <p class="kicker">${escapeHtml(row.environment)} · ${escapeHtml(row.status)}</p>
    <h1>${escapeHtml(headline(row))}</h1>
    <p class="lede">lomi. paying a merchant. The Stellar hop replaces the correspondent bank leg between XOF collected in UEMOA and dollars the merchant can hold.</p>
    ${definitionsHtml([
      ["Payout id", row.payout_id],
      ["Memo", row.memo],
      ["Amount", `${row.amount} ${row.currency_code}`],
      ["USDC sent", row.amount_usdc],
      ["Destination", row.destination],
      ["Last mile rail", row.last_mile_rail],
      ["Status", row.status],
      ["Created", row.created_at],
    ])}
    ${explorer}
    <p class="kicker">What ran</p>
    ${stepsHtml(payoutSteps(row), "Payout hops")}
    ${verdict}
    <p class="kicker">Why the memo matters</p>
    <p class="note">A Stellar text memo holds 28 bytes, so we put the first 28 characters of the payout id in it: <code>${escapeHtml(stellarMemoFromPayoutId(row.payout_id))}</code>. That makes every payment on chain reconcilable against one payout row without a shared database. Sending the same payout id twice settles once.</p>
    <p class="kicker">Settlement row</p>
    <pre>${escapeHtml(JSON.stringify(row, null, 2))}</pre>
    `,
  );
}

function payoutRow(row: StellarSettlementRecord): string {
  const hash = row.stellar_tx_hash
    ? `${row.stellar_tx_hash.slice(0, 12)}…`
    : "no hash";
  return `<li><div class="step-head"><span class="step-title"><a href="/demo/payouts/${escapeHtml(row.payout_id)}">${escapeHtml(row.payout_id)}</a></span><span class="tag">${escapeHtml(row.status)}</span></div><span class="step-copy">${escapeHtml(`${row.amount} ${row.currency_code} · ${row.amount_usdc} USDC · ${hash}`)}</span></li>`;
}

const CREATE_HINT = `curl -X POST $LAB/demo/payouts \\
  -H 'Content-Type: application/json' \\
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
