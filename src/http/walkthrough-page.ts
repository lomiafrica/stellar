import { shell } from "./page-chrome.js";

/** Payment from the 18 Oct 2026 Tranche 1 recording. Public on testnet. */
const TRANCHE1_TX =
  "d407b564fcf113f22711bbaa2738e4077e78b443aa9204e4566ab85f76d9eb0a";

/**
 * One address for the lab. Tranche 1 is the first list.
 * Later tranches stay on the same host, under their own heading.
 */
export function renderWalkthroughPage(): string {
  return shell(
    "Tranche 1",
    `
    <p class="kicker">Testnet lab</p>
    <h1>Tranche 1</h1>
    <p class="lede">lomi. collects CFA francs (XOF) on Wave and MTN. This lab is the test dollar in the middle of a payout. lomi. holds the USDC. The merchant still receives XOF.</p>
    <p class="kicker">This tranche</p>
    <ul class="rows card">
      <li>
        <a href="/deposit">Deposit with Freighter</a>
        <span class="step-copy">The anchor has to be running. Freighter signs the login, then this page saves a Wave sandbox credit of 1,000 XOF. That credit is not a Stellar payment.</span>
      </li>
      <li>
        <a href="/anchor/sep24/flow">How the money moves</a>
        <span class="step-copy">The same credit, read as cash in and cash out, without opening a wallet.</span>
      </li>
      <li>
        <a href="https://stellar.expert/explorer/testnet/tx/${TRANCHE1_TX}">One testnet USDC payment</a>
        <span class="step-copy">One payout id, sent twice, one payment. Creating another payment from this site asks for a lab key, so a visit cannot pay twice.</span>
      </li>
    </ul>
    <p class="kicker">Also on this lab</p>
    <ul class="rows card">
      <li>
        <a href="/.well-known/stellar.toml">Stellar file</a>
        <span class="step-copy">XOF and testnet USDC. Wallets read this before the login.</span>
      </li>
      <li>
        <a href="/demo/payouts">Payouts already recorded</a>
        <span class="step-copy">Each row is one payout id and, when it settled, one transaction.</span>
      </li>
      <li>
        <a href="https://github.com/lomiafrica/stellar/blob/main/docs/SEP-6-38.md">Quotes and programmatic transfer</a>
        <span class="step-copy">The next tranche. A reviewer can replay it against this host. It is not the Tranche 1 proof.</span>
      </li>
    </ul>
    `,
  );
}
