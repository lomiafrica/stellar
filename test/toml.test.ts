import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderStellarToml } from "../src/http/stellar-toml.js";

test("public stellar.toml lists XOF and Circle testnet USDC", () => {
  const toml = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../public/stellar.toml"),
    "utf8",
  );
  assert.match(toml, /code = "XOF"/);
  assert.match(
    toml,
    /issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"/,
  );
  assert.match(toml, /code = "USDC"/);
});

const TEMPLATE = `NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
ACCOUNTS=[]
TRANSFER_SERVER="{{ANCHOR_PUBLIC_URL}}/sep6"
WEB_AUTH_ENDPOINT="{{WEB_AUTH_ENDPOINT}}"
SIGNING_KEY="{{SIGNING_KEY}}"
issuer = "GPLACEHOLDER"
DOCUMENTATION="https://github.com/lomiafrica/stellar/blob/main/docs/ARCHITECTURE.md"
`;

test("renderStellarToml substitutes base URL, signing key, and accounts", () => {
  const body = renderStellarToml(TEMPLATE, {
    omnibusPublicKey: "GOMNI",
    merchantPublicKey: "GMERCH",
    publicBaseUrl: "https://stellar.example.test/",
    webAuthEndpoint: "https://anchor.example.test/auth",
    anchorPublicUrl: "https://anchor.example.test",
    sep10SigningPublicKey: "GSIGN",
  });
  assert.match(
    body,
    /TRANSFER_SERVER="https:\/\/anchor.example.test\/sep6"/,
  );
  assert.match(
    body,
    /WEB_AUTH_ENDPOINT="https:\/\/anchor.example.test\/auth"/,
  );
  assert.match(body, /issuer = "GOMNI"/);
  assert.match(body, /ACCOUNTS=\["GOMNI", "GMERCH"\]/);
  assert.match(body, /SIGNING_KEY="GSIGN"/);
});
