import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, Networks, WebAuth } from "@stellar/stellar-sdk";
import "../../src/env.js";
import { TESTNET_USDC_ISSUER } from "../../src/config.js";
import {
  asRecord,
  fetchJson,
  liveAnchorUrl,
  liveLabUrl,
  recordLiveProof,
} from "./helpers.js";

function tomlValue(text: string, key: string): string {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  return match?.[1] ?? "";
}

test("T2.1 live SEP-10, SEP-38 firm quote, and SEP-6 info", async () => {
  const lab = liveLabUrl();
  const anchor = liveAnchorUrl();
  const client = Keypair.random();
  const homeDomain = new URL(lab).host;

  const toml = await fetchJson(`${lab}/.well-known/stellar.toml`);
  assert.equal(toml.status, 200, toml.text);
  const signingKey = tomlValue(toml.text, "SIGNING_KEY");
  const webAuth = tomlValue(toml.text, "WEB_AUTH_ENDPOINT").replace(/\/$/, "");
  const transfer = tomlValue(toml.text, "TRANSFER_SERVER").replace(/\/$/, "");
  const quotes = tomlValue(toml.text, "ANCHOR_QUOTE_SERVER").replace(/\/$/, "");
  assert.ok(transfer.includes(new URL(anchor).host), transfer);
  assert.ok(quotes.includes(new URL(anchor).host), quotes);

  const info = await fetchJson(`${transfer}/info`);
  assert.equal(info.status, 200, info.text);
  assert.match(info.text, /USDC|XOF/);

  const challenge = await fetchJson(
    `${webAuth}?account=${client.publicKey()}&home_domain=${homeDomain}`,
  );
  assert.equal(challenge.status, 200, challenge.text);
  const xdr = String(asRecord(challenge.body).transaction ?? "");
  const read = WebAuth.readChallengeTx(
    xdr,
    signingKey,
    Networks.TESTNET,
    homeDomain,
    new URL(webAuth).host,
  );
  read.tx.sign(client);
  const tokenRes = await fetchJson(webAuth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: read.tx.toXDR() }),
  });
  const token = String(asRecord(tokenRes.body).token ?? "");
  assert.ok(token.length > 20, tokenRes.text);
  const auth = { Authorization: `Bearer ${token}` };

  const quote = await fetchJson(`${quotes}/quote`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      context: "sep6",
      sell_asset: "iso4217:XOF",
      buy_asset: `stellar:USDC:${TESTNET_USDC_ISSUER}`,
      sell_amount: "65596",
    }),
  });
  assert.ok(quote.status < 400, `quote ${quote.status}: ${quote.text}`);
  const quoteRow = asRecord(quote.body);
  const quoteId = String(quoteRow.id ?? "");
  const expires = String(quoteRow.expires_at ?? "");
  assert.ok(quoteId, quote.text);
  assert.ok(expires, quote.text);
  const price = Number(quoteRow.price ?? 0);
  const sell = Number(quoteRow.sell_amount ?? 0);
  const buy = Number(quoteRow.buy_amount ?? 0);
  if (price > 0 && sell > 0 && buy > 0) {
    assert.ok(Math.abs(sell - price * buy) < 1, quote.text);
  }

  recordLiveProof({
    sep6Info: `${transfer}/info`,
    sep38QuoteId: quoteId,
    sep38ExpiresAt: expires,
  });
});
