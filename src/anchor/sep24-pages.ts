import type { LastMileRail, LastMileResult } from "./last-mile.js";

export type Sep24Kind = "deposit" | "withdraw";
export type PathMark = "done" | "idle" | "skip";

interface Hop {
  title: string;
  idle: string;
  done: string;
  skip: string;
  /** True for the one hop this sandbox actually records. */
  live: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

function chromeCss(): string {
  return `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: #f7f7f4;
      color: #121317;
      line-height: 1.5;
    }
    main { max-width: 32rem; margin: 0 auto; padding: 2rem 1rem 3rem; }
    .kicker {
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6b6d73;
      margin: 1.5rem 0 0.4rem;
    }
    .kicker:first-child { margin-top: 0; }
    h1 { font-size: 1.3rem; letter-spacing: -0.02em; margin: 0 0 0.5rem; }
    p { margin: 0 0 0.9rem; }
    .lede { color: #5c5e66; font-size: 0.92rem; }
    .note { color: #5c5e66; font-size: 0.82rem; }
    .card {
      padding: 1rem;
      background: #fff;
      border: 1px solid #e6e6e1;
      border-radius: 4px;
    }
    label { display: block; margin: 0.8rem 0 0.25rem; font-size: 0.8rem; color: #5c5e66; }
    input, select {
      width: 100%;
      height: 2.5rem;
      padding: 0 0.7rem;
      border: 1px solid #d6d6d0;
      border-radius: 4px;
      background: #fff;
      font: inherit;
    }
    button {
      margin-top: 1.1rem;
      width: 100%;
      height: 2.75rem;
      border: 0;
      border-radius: 4px;
      background: #121317;
      color: #fff;
      font: inherit;
      font-weight: 600;
    }
    .path { list-style: none; margin: 0; padding: 0; }
    .path li { padding: 0.55rem 0; border-top: 1px solid #ecece7; }
    .path li:first-child { border-top: 0; padding-top: 0; }
    .path li:last-child { padding-bottom: 0; }
    .step-title { font-size: 0.9rem; font-weight: 600; }
    .step-copy { display: block; color: #6b6d73; font-size: 0.8rem; }
    .path li.skip .step-title, .path li.skip .step-copy { color: #8a8c93; }
    .tag {
      display: inline-block;
      margin-left: 0.4rem;
      font-size: 0.68rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-weight: 600;
      color: #6b6d73;
    }
    .path li.done .tag { color: #1f7a58; }
    dl { margin: 0; font-size: 0.9rem; }
    dl div { display: flex; justify-content: space-between; gap: 1rem; padding: 0.4rem 0; border-top: 1px solid #ecece7; }
    dl div:first-child { border-top: 0; padding-top: 0; }
    dt { color: #6b6d73; }
    dd { margin: 0; text-align: right; word-break: break-all; }
    pre {
      margin: 0;
      padding: 0.9rem;
      background: #fff;
      border: 1px solid #e6e6e1;
      border-radius: 4px;
      font-size: 0.72rem;
      line-height: 1.45;
      overflow: auto;
      color: #3d3f46;
    }
  `;
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${chromeCss()}</style>
</head>
<body>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

function tagFor(mark: PathMark): string {
  if (mark === "done") return "sandbox";
  if (mark === "skip") return "did not run";
  return "would run";
}

function stepItem(mark: PathMark, hop: Hop): string {
  const copy = mark === "done" ? hop.done : mark === "skip" ? hop.skip : hop.idle;
  return `<li class="${mark}"><span class="step-title">${escapeHtml(hop.title)}</span><span class="tag">${tagFor(mark)}</span><span class="step-copy">${escapeHtml(copy || hop.idle)}</span></li>`;
}

/** Three hops the money would take. Only the mobile money hop is recorded here. */
export function moneyPathHtml(input: {
  kind: Sep24Kind;
  rail: LastMileRail;
  mode: "form" | "receipt" | "map";
}): string {
  const items = hopsFor(input.kind, input.rail)
    .map((hop) => {
      if (input.mode !== "receipt") return stepItem("idle", hop);
      return stepItem(hop.live ? "done" : "skip", hop);
    })
    .join("");
  return `<ol class="path card" aria-label="How the money moves">${items}</ol>`;
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
  const rows: [string, string][] = [
    ["Status", credit.status],
    ["Rail", rail],
    ["Amount in CFA", credit.amountXof],
    ["Phone", credit.phone],
    ["Lab id", credit.payoutId],
    ["Direction", credit.kind],
    ["Created", credit.createdAt],
  ];
  const list = rows
    .map(
      ([key, value]) =>
        `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join("");
  return shell(
    `${rail} sandbox`,
    `
    <p class="kicker">Testnet · sandbox</p>
    <h1>Sandbox last mile recorded</h1>
    <p class="lede">${escapeHtml(credit.message)} This id is not a Stellar payment and has no row on a block explorer.</p>
    <dl class="card">${list}</dl>
    <p class="kicker">What ran</p>
    ${moneyPathHtml({ kind: credit.kind, rail: credit.rail, mode: "receipt" })}
    <p class="kicker">Receipt</p>
    <pre>${escapeHtml(JSON.stringify(credit, null, 2))}</pre>
    `,
  );
}
