import { Keypair } from "@stellar/stellar-sdk";
import "../src/env.js";
import { PUBLIC_BASE_URL } from "../src/config.js";
import { findByPayoutId, readLedger } from "../src/ledger/store.js";

function argValue(flag: string): string | undefined {
  const prefixed = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (prefixed) return prefixed.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const base = (argValue("--base") ?? PUBLIC_BASE_URL).replace(/\/$/, "");
const skipPayout = process.argv.includes("--skip-payout");
const allowEmptySigning = process.argv.includes("--allow-empty-signing");
const payoutIdArg = argValue("--payout-id");

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  const mark = ok ? "ok" : "FAIL";
  console.log(`${mark}  ${name}${detail ? `  ${detail}` : ""}`);
}

async function readBody(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; text: string }> {
  const response = await fetch(`${base}${path}`, init);
  return { status: response.status, text: await response.text() };
}

async function readJson(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const { status, text } = await readBody(path, init);
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = { raw: text };
  }
  return { status, body };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function main() {
  const toml = await readBody("/.well-known/stellar.toml");
  const hasXof = toml.text.includes('code = "XOF"');
  const signingMatch = toml.text.match(/SIGNING_KEY="(G[A-Z0-9]+)"/);
  const signingOk = Boolean(signingMatch) || allowEmptySigning;
  record(
    "toml",
    toml.status === 200 && hasXof && signingOk,
    `status=${toml.status} xof=${hasXof} signing=${signingMatch?.[1] ?? "(empty)"}`,
  );

  const unknownAccount = Keypair.random().publicKey();
  const sep12Unknown = await readJson("/anchor/sep12/customer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: unknownAccount, type: "sep24" }),
  });
  const unknownStatus = asRecord(sep12Unknown.body).status;
  record(
    "sep12-unknown",
    sep12Unknown.status < 500 && unknownStatus === "NEEDS_INFO",
    `http=${sep12Unknown.status} status=${String(unknownStatus)}`,
  );

  const sep24 = await readJson("/anchor/sep24/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: "1000",
      phone: "+2250700000000",
      rail: "wave",
    }),
  });
  const lastMile = asRecord(asRecord(sep24.body).last_mile);
  record(
    "sep24-sandbox",
    lastMile.status === "sandbox",
    `status=${String(lastMile.status)}`,
  );

  const expiredQuote = await readJson("/anchor/sep38/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sell_asset: "iso4217:XOF",
      buy_asset: "stellar:USDC",
      sell_amount: "1000",
      ttl_seconds: 0,
    }),
  });
  const expiredId = String(asRecord(expiredQuote.body).id ?? "");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const expiredGet = await readJson(`/anchor/sep38/quote/${expiredId}`);
  record(
    "sep38-expired",
    expiredGet.status === 400,
    `http=${expiredGet.status}`,
  );

  const liveQuote = await readJson("/anchor/sep38/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sell_asset: "iso4217:XOF",
      buy_asset: "stellar:USDC",
      sell_amount: "1000",
      ttl_seconds: 60,
    }),
  });
  const liveId = String(asRecord(liveQuote.body).id ?? "");
  const sep6 = await readJson("/anchor/sep6/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: "1000",
      rail: "wave",
      quote_id: liveId,
    }),
  });
  const sep6LastMile = asRecord(asRecord(sep6.body).lastMile);
  record(
    "sep6-live-quote",
    sep6.status < 400 && sep6LastMile.status === "sandbox",
    `http=${sep6.status} last_mile=${String(sep6LastMile.status)}`,
  );

  const sep31Missing = await readJson("/anchor/sep31/receive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: "1000" }),
  });
  record(
    "sep31-requires-hash",
    sep31Missing.status === 400,
    `http=${sep31Missing.status}`,
  );

  const sep31Ok = await readJson("/anchor/sep31/receive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sending_anchor: "replay",
      amount: "1000",
      stellar_tx_hash: "replay-hash-001",
    }),
  });
  const sep31Body = asRecord(sep31Ok.body);
  record(
    "sep31-with-hash",
    sep31Ok.status < 400 &&
      Boolean(sep31Body.stellar_tx_hash ?? sep31Body.stellarTxHash),
    `http=${sep31Ok.status}`,
  );

  if (!skipPayout) {
    const payoutId =
      payoutIdArg ??
      readLedger()
        .filter((row) => row.stellar_tx_hash)
        .at(-1)?.payout_id;
    if (!payoutId) {
      record("demo-payout-replay", false, "no payout_id; pass --payout-id or run pnpm settle:10");
    } else {
      const body = {
        destination: "self",
        rail: "stellar",
        amount: 10,
        currency_code: "USD",
        payout_id: payoutId,
      };
      const first = await readJson("/demo/payouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `replay-${payoutId}`,
        },
        body: JSON.stringify(body),
      });
      const second = await readJson("/demo/payouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `replay-${payoutId}-b`,
        },
        body: JSON.stringify(body),
      });
      const firstHash = String(asRecord(first.body).stellar_tx_hash ?? "");
      const secondHash = String(asRecord(second.body).stellar_tx_hash ?? "");
      const ledger = findByPayoutId(payoutId);
      record(
        "demo-payout-replay",
        first.status < 400 &&
          second.status < 400 &&
          Boolean(firstHash) &&
          firstHash === secondHash &&
          ledger?.stellar_tx_hash === firstHash,
        `payout_id=${payoutId} hash=${firstHash.slice(0, 12)}…`,
      );
    }
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    console.error(`http-replay failed ${failed.length}/${checks.length} against ${base}`);
    process.exit(1);
  }
  console.log(`http-replay passed ${checks.length} checks against ${base}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
