import {
  definitionsHtml,
  escapeHtml,
  shell,
  stepsHtml,
  type PageStep,
} from "../http/page-chrome.js";
import type { LastMileRail, LastMileResult } from "./last-mile.js";

export type Sep24Kind = "deposit" | "withdraw";
export type PathMark = PageStep["mark"];

interface Hop {
  title: string;
  idle: string;
  done: string;
  skip: string;
  /** True for the one hop this sandbox actually records. */
  live: boolean;
}

function railLabel(rail: LastMileRail): string {
  if (rail === "mtn") return "MTN";
  if (rail === "spi") return "SPI";
  return "Wave";
}

function hopsFor(kind: Sep24Kind, rail: LastMileRail): Hop[] {
  const name = railLabel(rail);
  if (kind === "withdraw") {
    return [
      {
        title: "Wallet sends USDC",
        idle: "USDC would leave the wallet.",
        done: "",
        skip: "Did not run. No USDC left the wallet.",
        live: false,
      },
      {
        title: "Anchor converts",
        idle: "Anchor would hold USDC and pay CFA.",
        done: "",
        skip: "Did not run. No conversion.",
        live: false,
      },
      {
        title: `${name} pays the phone`,
        idle: "CFA would land on the phone.",
        done: "Recorded as sandbox. No live CFA left.",
        skip: "",
        live: true,
      },
    ];
  }
  return [
    {
      title: `${name} takes CFA`,
      idle: "CFA would leave the phone.",
      done: "Recorded as sandbox. No live CFA moved.",
      skip: "",
      live: true,
    },
    {
      title: "Anchor converts",
      idle: "Anchor would mint testnet USDC.",
      done: "",
      skip: "Did not run. No USDC minted.",
      live: false,
    },
    {
      title: "Wallet receives USDC",
      idle: "Wallet would show a deposit.",
      done: "",
      skip: "Did not run. Wallet unchanged.",
      live: false,
    },
  ];
}

function tagFor(mark: PathMark): string {
  if (mark === "done") return "sandbox";
  if (mark === "skip") return "did not run";
  return "would run";
}

function toStep(mark: PathMark, hop: Hop): PageStep {
  const copy = mark === "done" ? hop.done : mark === "skip" ? hop.skip : hop.idle;
  return {
    title: hop.title,
    tag: tagFor(mark),
    copy: copy || hop.idle,
    mark,
  };
}

/** Three hops the money would take. Only the mobile money hop is recorded here. */
export function moneyPathHtml(input: {
  kind: Sep24Kind;
  rail: LastMileRail;
  mode: "form" | "receipt" | "map";
}): string {
  const steps = hopsFor(input.kind, input.rail).map((hop) => {
    if (input.mode !== "receipt") return toStep("idle", hop);
    return toStep(hop.live ? "done" : "skip", hop);
  });
  return stepsHtml(steps, "How the money moves");
}

export function renderSep24FlowPage(): string {
  return shell(
    "How money moves",
    `
    <p class="kicker">Testnet</p>
    <h1>How the money moves</h1>
    <p class="lede">Cash in starts on Wave. Cash out starts in the wallet. This lab records the mobile money hop as sandbox only. It does not create a Stellar payment.</p>
    <p class="kicker">Cash in</p>
    ${moneyPathHtml({ kind: "deposit", rail: "wave", mode: "map" })}
    <p class="kicker">Cash out</p>
    ${moneyPathHtml({ kind: "withdraw", rail: "wave", mode: "map" })}
    `,
  );
}

export function renderSep24Interactive(input: {
  kind: Sep24Kind;
  amount: string;
  token: string;
  transactionId: string;
  rail?: LastMileRail;
}): string {
  const rail = input.rail ?? "wave";
  const title =
    input.kind === "withdraw" ? "Sandbox withdraw" : "Sandbox deposit";
  const selected = (value: LastMileRail) => (rail === value ? " selected" : "");
  return shell(
    title,
    `
    <p class="kicker">Testnet · sandbox</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="lede">This records a mobile money last mile for the lab. No live CFA moves and no Stellar payment is created.</p>
    <form class="card" id="pay-form" method="post" action="/anchor/sep24/${input.kind}">
      <input type="hidden" name="token" value="${escapeHtml(input.token)}">
      <input type="hidden" name="transaction_id" value="${escapeHtml(input.transactionId)}">
      <label for="amount">Amount in CFA</label>
      <input id="amount" name="amount" type="number" min="100" value="${escapeHtml(input.amount)}" required>
      <label for="phone">Phone</label>
      <input id="phone" name="phone" type="tel" value="+2250700000000" required>
      <label for="rail">Rail</label>
      <select id="rail" name="rail">
        <option value="wave"${selected("wave")}>Wave</option>
        <option value="mtn"${selected("mtn")}>MTN</option>
        <option value="spi"${selected("spi")}>SPI</option>
      </select>
      <button type="submit">Record sandbox last mile</button>
    </form>
    <p class="kicker">What would happen</p>
    ${moneyPathHtml({ kind: input.kind, rail, mode: "form" })}
    `,
  );
}

export function renderSep24MoreInfo(transactionId: string): string {
  return shell(
    "SEP-24 status",
    `
    <p class="kicker">Testnet · sandbox</p>
    <h1>No Stellar payment on this page</h1>
    <p class="lede">The last mile is a sandbox mobile money receipt. This id is not on the ledger.</p>
    ${moneyPathHtml({ kind: "deposit", rail: "wave", mode: "map" })}
    <p class="kicker">Lab id</p>
    <p class="note">${escapeHtml(transactionId || "none yet")}</p>
    `,
  );
}

/** HTML receipt after a sandbox Wave / MTN / SPI last mile. */
export function renderSep24CreditReceipt(credit: LastMileResult): string {
  const rail = railLabel(credit.rail);
  return shell(
    `${rail} sandbox`,
    `
    <p class="kicker">Testnet · sandbox</p>
    <h1>Sandbox last mile recorded</h1>
    <p class="lede">${escapeHtml(credit.message)} This id is not a Stellar payment and has no row on a block explorer.</p>
    ${definitionsHtml([
      ["Status", credit.status],
      ["Rail", rail],
      ["Amount in CFA", credit.amountXof],
      ["Phone", credit.phone],
      ["Lab id", credit.payoutId],
      ["SEP-24 direction", credit.kind],
      ["Created", credit.createdAt],
    ])}
    <p class="kicker">What ran</p>
    ${moneyPathHtml({ kind: credit.kind, rail: credit.rail, mode: "receipt" })}
    <p class="kicker">Why this says deposit and not payout</p>
    <p class="note">Deposit and withdraw are SEP-24 words for a wallet holder moving fiat in or out. That is the anchor direction. A lomi. payout is the other direction, lomi. paying a merchant, and it runs on <code>POST /payouts</code> with <code>rail=stellar</code>. See <a href="/demo/payouts">the payout ledger</a>.</p>
    <p class="kicker">Receipt</p>
    <pre>${escapeHtml(JSON.stringify(credit, null, 2))}</pre>
    `,
  );
}
