import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../src/env.js";

const LAB =
  process.env.T1_LAB_URL?.replace(/\/$/, "") ??
  "https://lab-production-5fac.up.railway.app";
const ANCHOR =
  process.env.T1_ANCHOR_URL?.replace(/\/$/, "") ??
  "https://anchor-production-5059.up.railway.app";
const HOME_DOMAIN = new URL(LAB).host;
const MERCHANT = "GAOHXCYCLGQDETU33F4AB5DZUSEPRHHEROJ3FCZ6I4S6MDV7FZQVVW2Y";
const UNKNOWN =
  "GUNKNOWNACCOUNT00000000000000000000000000000000000000";
const NEST_EXPLORER =
  "https://stellar.expert/explorer/testnet/tx/49e2a131c61d7b3e41e0b53b6a22cb98fe98fbf0fdeadfa2b1e4342ccf328ffe";
const NEST_PAYOUT = "83e4aa27-e619-4d13-963c-9b49ce62a59f";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logDir = join(root, ".scf", "t1-logs");

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const response = await fetch(url);
  return { status: response.status, text: await response.text() };
}

async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = { raw: text.slice(0, 800) };
  }
  return { status: response.status, body };
}

function writeLog(name: string, value: unknown): void {
  const path = join(logDir, name);
  const text =
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
  console.log(`wrote ${name}`);
}

function walkthroughMarkdown(): string {
  return `# SEP-24 sandbox walkthrough

Two proofs. Do not mix them in one clip.

## Wave last mile (this clip)

Money path on the page: Wave CFA, then Anchor, then the wallet. Only the Wave hop runs. It writes a sandbox receipt. It does not create a Stellar payment. Do not open StellarExpert here.

1. Open \`https://${HOME_DOMAIN}/anchor/sep24/flow\`. Read cash in vs cash out.
2. Open the interactive form (Freighter, or lab \`/anchor/sep24/interactive\`). Last mile = Wave sandbox. Submit.
3. Receipt shows a sandbox Wave hop and says this lab id is not a Stellar transaction.
4. Optional: \`https://${HOME_DOMAIN}/anchor/sep24/credit/<id>\` in a browser (same receipt).

Freighter/LOBSTR on Testnet still needs home domain \`${HOME_DOMAIN}\` for a wallet-signed SEP-10. Toml and \`/sep24/info\` stay protocol pages, not the human story.

## Nest USDC hop (separate clip)

Different money. Merchant \`POST /payouts\` \`rail=stellar\`. Payout \`${NEST_PAYOUT}\`. Explorer ${NEST_EXPLORER}

Logs from \`pnpm t1:walkthrough\` live in gitignored \`.scf/t1-logs/\`. Do not commit JWT secrets or seeds.

## Replay without a wallet

\`\`\`bash
pnpm t1:walkthrough
pnpm http:replay -- --base ${LAB}
\`\`\`
`;
}

async function main(): Promise<void> {
  mkdirSync(logDir, { recursive: true });

  const toml = await fetchText(`${LAB}/.well-known/stellar.toml`);
  writeLog("toml.txt", toml.text);

  const info = await fetchJson(`${ANCHOR}/sep24/info`);
  writeLog("sep24-info.json", { status: info.status, body: info.body });

  const challenge = await fetchText(
    `${ANCHOR}/auth?account=${MERCHANT}&home_domain=${HOME_DOMAIN}`,
  );
  writeLog("sep10-challenge.json", {
    status: challenge.status,
    body: (() => {
      try {
        return JSON.parse(challenge.text) as unknown;
      } catch {
        return { raw: challenge.text.slice(0, 800) };
      }
    })(),
  });

  const needs = await fetchJson(
    `${LAB}/anchor/sep12/customer?account=${UNKNOWN}`,
  );
  writeLog("sep12-needs-info.json", { status: needs.status, body: needs.body });

  const callbackSecret = process.env.CALLBACK_AUTH_SECRET?.trim();
  if (callbackSecret) {
    const put = await fetchJson(`${LAB}/anchor/customer`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": callbackSecret,
      },
      body: JSON.stringify({
        account: UNKNOWN,
        type: "sep24",
        email: "sandbox@example.test",
      }),
    });
    writeLog("sep12-accepted.json", { status: put.status, body: put.body });
  } else {
    const accepted = await fetchJson(
      `${LAB}/anchor/sep12/customer?account=${MERCHANT}`,
    );
    writeLog("sep12-accepted.json", {
      status: accepted.status,
      body: accepted.body,
    });
  }

  writeFileSync(join(root, "docs", "WALKTHROUGH.md"), walkthroughMarkdown());
  console.log("updated docs/WALKTHROUGH.md");

  console.log(`
Wave clip (no explorer)
  1. Flow  ${LAB}/anchor/sep24/flow
  2. Form  ${LAB}/anchor/sep24/interactive
  3. Receipt after Wave sandbox submit
Nest hop is a separate clip  ${NEST_EXPLORER}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
