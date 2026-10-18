import {
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
  const copy =
    mark === "done" ? hop.done : mark === "skip" ? hop.skip : hop.idle;
  return {
    title: hop.title,
    tag: tagFor(mark),
    copy: copy || hop.idle,
    mark,
    live: hop.live,
  };
}

/** Three hops the money would take. Only the mobile money hop is recorded here. */
export function moneyPathHtml(input: {
  kind: Sep24Kind;
  rail: LastMileRail;
  mode: "form" | "receipt" | "map";
  layout?: "row";
}): string {
  const steps = hopsFor(input.kind, input.rail).map((hop) => {
    if (input.mode !== "receipt") return toStep("idle", hop);
    return toStep(hop.live ? "done" : "skip", hop);
  });
  return stepsHtml(
    steps,
    "How the money moves",
    input.layout === "row" ? "row" : "",
  );
}

export function renderSep24FlowPage(): string {
  return shell(
    "How money moves",
    `
    <p class="kicker">Testnet</p>
    <h1>How the money moves</h1>
    <p class="lede">Cash in would start on Wave and finish in the wallet, cash out would run that same path backwards, and this page only keeps a sandbox note of the mobile-money hop so it never creates a Stellar payment.</p>
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
  const lede =
    input.kind === "withdraw"
      ? "Cash out would start in the wallet and finish on the phone, and this page only keeps a sandbox note of that hop so it never creates a Stellar payment."
      : "This page runs the deposit in Freighter. After you approve, you record 1,000 CFA on mobile money, and the note stays in the sandbox.";
  return shell(
    title,
    `
    <p class="kicker">Testnet</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="lede" id="lede">${lede}</p>
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
      <button type="submit">Record the hop</button>
    </form>
    <p class="note" id="result" hidden></p>
    ${moneyPathHtml({ kind: input.kind, rail, mode: "form", layout: "row" })}
    <script>
      const form = document.querySelector("#pay-form");
      const rail = document.querySelector("#rail");
      const lede = document.querySelector("#lede");
      const result = document.querySelector("#result");
      const live = document.querySelector("[data-live]");
      const verb = ${JSON.stringify(input.kind === "withdraw" ? "pays the phone" : "takes CFA")};
      rail.addEventListener("change", () => {
        const name = rail.options[rail.selectedIndex].textContent;
        live.querySelector(".step-title").textContent = name + " " + verb;
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector("button");
        button.disabled = true;
        const body = Object.fromEntries(new FormData(form));
        const response = await fetch(form.action, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await response.json();
        const hop = payload.last_mile || {};
        document.querySelectorAll(".path li").forEach((item) => {
          const recorded = item.hasAttribute("data-live");
          item.className = recorded ? "done" : "skip";
          item.querySelector(".tag").textContent = recorded ? "sandbox" : "did not run";
        });
        const railName = rail.options[rail.selectedIndex].textContent;
        const amount = hop.amountXof || body.amount;
        lede.textContent = railName + " kept a sandbox note for " + Number(amount).toLocaleString("en-US") + " CFA. The id on this page is that note, not a Stellar payment.";
        result.hidden = false;
        result.textContent = hop.payoutId || "";
        button.disabled = false;
      });
    </script>
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
    <p class="kicker">Testnet</p>
    <h1>Sandbox last mile recorded</h1>
    <p class="lede">${escapeHtml(rail)} kept a sandbox note for ${escapeHtml(credit.amountXof)} CFA. The id on this page is that note, not a Stellar payment.</p>
    <p class="note">${escapeHtml(credit.payoutId)}</p>
    ${moneyPathHtml({ kind: credit.kind, rail: credit.rail, mode: "receipt", layout: "row" })}
    <p class="note">${escapeHtml(credit.amountXof)} CFA · ${escapeHtml(credit.phone)}</p>
    `,
  );
}
