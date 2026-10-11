import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderStellarToml,
  TESTNET_OMNIBUS_PUBLIC_KEY,
} from "../src/http/stellar-toml.js";

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
  assert.match(toml, /TRANSFER_SERVER="\{\{ANCHOR_PUBLIC_URL\}\}\/sep6"/);
  assert.match(toml, /ANCHOR_QUOTE_SERVER="\{\{ANCHOR_PUBLIC_URL\}\}\/sep38"/);
  assert.match(toml, /Test SDF Network/);
});

test("mainnet toml is unpublished and refuses the testnet omnibus", () => {
  const mainnet = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../public/stellar.mainnet.toml",
    ),
    "utf8",
  );
  assert.match(mainnet, /Public Global Stellar Network/);
  assert.match(
    mainnet,
    /issuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"/,
  );
  assert.equal(mainnet.includes(TESTNET_OMNIBUS_PUBLIC_KEY), false);
  assert.equal(
    mainnet.includes(
      "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ),
    false,
  );
  assert.throws(
    () =>
      renderStellarToml(mainnet, {
        omnibusPublicKey: TESTNET_OMNIBUS_PUBLIC_KEY,
      }),
    /testnet omnibus/,
  );
  const rendered = renderStellarToml(mainnet, {
    omnibusPublicKey: "GMAINNETEXAMPLEKEYNOTATESTNETACCOUNT",
    anchorPublicUrl: "https://anchor.example.test",
  });
  assert.equal(rendered.includes(TESTNET_OMNIBUS_PUBLIC_KEY), false);
  assert.match(
    rendered,
    /TRANSFER_SERVER="https:\/\/anchor.example.test\/sep6"/,
  );
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
  assert.match(body, /TRANSFER_SERVER="https:\/\/anchor.example.test\/sep6"/);
  assert.match(body, /WEB_AUTH_ENDPOINT="https:\/\/anchor.example.test\/auth"/);
  assert.match(body, /issuer = "GOMNI"/);
  assert.match(body, /ACCOUNTS=\["GOMNI", "GMERCH"\]/);
  assert.match(body, /SIGNING_KEY="GSIGN"/);
});
