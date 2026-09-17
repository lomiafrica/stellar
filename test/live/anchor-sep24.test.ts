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

test("T1.1 live SEP-10 to SEP-24 through Anchor Platform, sandbox last mile only", async () => {
  const lab = liveLabUrl();
  const anchor = liveAnchorUrl();
  const client = Keypair.random();
  const homeDomain = new URL(lab).host;

  const toml = await fetchJson(`${lab}/.well-known/stellar.toml`);
  assert.equal(toml.status, 200);
  assert.match(toml.text, /code = "XOF"/);
  assert.match(toml.text, /code = "USDC"/);
  const signingKey = tomlValue(toml.text, "SIGNING_KEY");
  const webAuth = tomlValue(toml.text, "WEB_AUTH_ENDPOINT").replace(/\/$/, "");
  const sep24 = tomlValue(toml.text, "TRANSFER_SERVER_SEP0024").replace(
    /\/$/,
    "",
  );
  const kyc = tomlValue(toml.text, "KYC_SERVER").replace(/\/$/, "");
  assert.ok(signingKey.startsWith("G"));
  assert.ok(webAuth.includes(new URL(anchor).host));
  assert.ok(sep24.includes(new URL(anchor).host));

  const challenge = await fetchJson(
    `${webAuth}?account=${client.publicKey()}&home_domain=${homeDomain}`,
  );
  const challengeRow = asRecord(challenge.body);
  assert.equal(challenge.status, 200, challenge.text);
  const xdr = String(challengeRow.transaction ?? "");
  assert.ok(xdr.length > 0);
  const webAuthDomain = new URL(webAuth).host;
  const read = WebAuth.readChallengeTx(
    xdr,
    signingKey,
    Networks.TESTNET,
    homeDomain,
    webAuthDomain,
  );
  read.tx.sign(client);
  const tokenRes = await fetchJson(webAuth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: read.tx.toXDR() }),
  });
  const token = String(asRecord(tokenRes.body).token ?? "");
  assert.ok(token.length > 20, `SEP-10 token missing: ${tokenRes.text}`);

  const auth = { Authorization: `Bearer ${token}` };
  const needs = await fetchJson(`${kyc}/customer`, { headers: auth });
  const needsRow = asRecord(needs.body);
  assert.equal(needsRow.status, "NEEDS_INFO");

  const put = await fetchJson(`${kyc}/customer`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      account: client.publicKey(),
      email_address: "sandbox@example.test",
    }),
  });
  assert.ok(put.status < 400, `SEP-12 PUT ${put.status}: ${put.text}`);
  let sep12Status = String(asRecord(put.body).status ?? "");
  for (let i = 0; i < 8 && sep12Status !== "ACCEPTED"; i += 1) {
    const again = await fetchJson(`${kyc}/customer`, { headers: auth });
    sep12Status = String(asRecord(again.body).status ?? "");
    if (sep12Status === "ACCEPTED") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(sep12Status, "ACCEPTED", `SEP-12 never ACCEPTED: ${put.text}`);

  const interactive = await fetchJson(
    `${sep24}/transactions/withdraw/interactive`,
    {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_code: "USDC",
        asset_issuer: TESTNET_USDC_ISSUER,
        account: client.publicKey(),
        amount: "10",
      }),
    },
  );
  const interactiveRow = asRecord(interactive.body);
  const url = String(interactiveRow.url ?? "");
  const platformId = String(interactiveRow.id ?? "");
  assert.ok(
    url.includes(new URL(lab).host),
    `interactive url should be on the lab host: ${url || interactive.text}`,
  );
  assert.ok(platformId);

  const form = await fetchJson(url);
  assert.equal(form.status, 200);
  assert.match(form.text, /id="pay-form"/);
  assert.doesNotMatch(form.text, /<script/i);

  const tokenMatch = form.text.match(/name="token" value="([^"]+)"/);
  const txMatch = form.text.match(/name="transaction_id" value="([^"]+)"/);
  const actionMatch = form.text.match(/action="([^"]+)"/);
  const formToken = tokenMatch?.[1] ?? "";
  const formTx = txMatch?.[1] ?? platformId;
  const action = actionMatch?.[1] ?? "";
  const postUrl = action.startsWith("http")
    ? action
    : `${lab}${action.startsWith("/") ? "" : "/"}${action}`;

  const complete = await fetchJson(postUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      amount: "1000",
      phone: "+2250700000000",
      rail: "wave",
      token: formToken,
      transaction_id: formTx,
    }).toString(),
  });
  assert.ok(complete.status < 400, `form POST ${complete.status}`);
  assert.match(complete.text, /Sandbox last mile recorded/);

  const platformTx = await fetchJson(
    `${sep24}/transaction?id=${encodeURIComponent(platformId)}`,
    { headers: auth },
  );
  const txBody = asRecord(asRecord(platformTx.body).transaction);
  assert.equal(
    txBody.status,
    "completed",
    `platform tx ${platformTx.status}: ${platformTx.text}`,
  );
  assert.equal(
    txBody.stellar_transaction_id ?? txBody.stellarTransactionId ?? null,
    null,
  );

  const credit = await fetchJson(`${lab}/anchor/sep24/credit/${formTx}`);
  const creditRow = asRecord(credit.body);
  assert.equal(creditRow.status, "sandbox");

  recordLiveProof({
    sep10Account: client.publicKey(),
    platformTxId: platformId,
    labCreditId: formTx,
    interactiveUrlHost: new URL(url).host,
  });
});
