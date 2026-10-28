import "../src/env.js";
import { Keypair, Networks, WebAuth } from "@stellar/stellar-sdk";
import { TESTNET_USDC_ISSUER } from "../src/config.js";
import { isJsonObject, parseJson, type JsonObject } from "../src/json.js";

function argValue(flag: string): string | undefined {
  const prefixed = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (prefixed) return prefixed.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const lab = (
  argValue("--lab") ??
  process.env.LIVE_LAB_URL ??
  "https://lab-production-5fac.up.railway.app"
).replace(/\/$/, "");
const anchor = (
  argValue("--anchor") ??
  process.env.LIVE_ANCHOR_URL ??
  "https://anchor-production-5059.up.railway.app"
).replace(/\/$/, "");

function tomlValue(text: string, key: string): string {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  return match?.[1] ?? "";
}

async function readJson(url: string, init?: RequestInit): Promise<JsonObject> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${url} ${text.slice(0, 240)}`);
  }
  const parsed = parseJson(text);
  return isJsonObject(parsed) ? parsed : {};
}

async function main(): Promise<void> {
  const tomlText = await (
    await fetch(`${lab}/.well-known/stellar.toml`)
  ).text();
  const webAuth = tomlValue(tomlText, "WEB_AUTH_ENDPOINT").replace(/\/$/, "");
  const transfer = tomlValue(tomlText, "TRANSFER_SERVER").replace(/\/$/, "");
  const quotes = tomlValue(tomlText, "ANCHOR_QUOTE_SERVER").replace(/\/$/, "");
  const signingKey = tomlValue(tomlText, "SIGNING_KEY");
  const client = Keypair.random();
  const homeDomain = new URL(lab).host;
  const challenge = await readJson(
    `${webAuth}?account=${client.publicKey()}&home_domain=${homeDomain}`,
  );
  const read = WebAuth.readChallengeTx(
    String(challenge.transaction ?? ""),
    signingKey,
    Networks.TESTNET,
    homeDomain,
    new URL(webAuth).host,
  );
  read.tx.sign(client);
  const tokenBody = await readJson(webAuth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: read.tx.toXDR() }),
  });
  const token = String(tokenBody.token ?? "");
  const auth = { Authorization: `Bearer ${token}` };
  const info = await readJson(`${transfer}/info`, { headers: auth });
  const prices = await readJson(
    `${quotes}/prices?sell_asset=iso4217:XOF&sell_amount=65596&buy_asset=${encodeURIComponent(`stellar:USDC:${TESTNET_USDC_ISSUER}`)}`,
    { headers: auth },
  );
  const usdc = `stellar:USDC:${TESTNET_USDC_ISSUER}`;
  const firmQuote = (sellAsset: string, buyAsset: string, sellAmount: string) =>
    readJson(`${quotes}/quote`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        context: "sep6",
        sell_asset: sellAsset,
        buy_asset: buyAsset,
        sell_amount: sellAmount,
      }),
    });
  const quote = await firmQuote("iso4217:XOF", usdc, "65596");
  const quoteId = String(quote.id ?? "");
  const deposit = await readJson(
    `${transfer}/deposit-exchange?destination_asset=USDC&source_asset=iso4217:XOF&amount=65596&type=wave&account=${client.publicKey()}&quote_id=${encodeURIComponent(quoteId)}`,
    { headers: auth },
  );
  const withdrawQuote = await firmQuote(usdc, "iso4217:XOF", "10");
  const withdrawQuoteId = String(withdrawQuote.id ?? "");
  const withdraw = await readJson(
    `${transfer}/withdraw-exchange?source_asset=USDC&destination_asset=iso4217:XOF&amount=10&type=wave&account=${client.publicKey()}&quote_id=${encodeURIComponent(withdrawQuoteId)}`,
    { headers: auth },
  );
  const depositId = String(deposit.id ?? "");
  const transaction = depositId
    ? await readJson(
        `${transfer}/transaction?id=${encodeURIComponent(depositId)}`,
        { headers: auth },
      )
    : {};
  console.log(
    JSON.stringify(
      {
        lab,
        anchor,
        transfer,
        quotes,
        info_keys: Object.keys(info),
        prices,
        quote_id: quoteId,
        expires_at: quote.expires_at,
        deposit_id: depositId,
        withdraw_quote_id: withdrawQuoteId,
        withdraw_id: withdraw.id ?? "",
        transaction,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
