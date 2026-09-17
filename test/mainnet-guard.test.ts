import assert from "node:assert/strict";
import test from "node:test";
import { assertMainnetAllowed, assertDeployNetwork, getStellarNetwork } from "../src/config.js";

test("getStellarNetwork defaults to testnet", () => {
  const previous = process.env.STELLAR_NETWORK;
  delete process.env.STELLAR_NETWORK;
  assert.equal(getStellarNetwork(), "testnet");
  if (previous === undefined) {
    delete process.env.STELLAR_NETWORK;
  } else {
    process.env.STELLAR_NETWORK = previous;
  }
});

test("assertMainnetAllowed refuses without confirm", () => {
  const previous = process.env.STELLAR_MAINNET_CONFIRM;
  delete process.env.STELLAR_MAINNET_CONFIRM;
  assert.throws(() => assertMainnetAllowed(), /Mainnet refused/);
  if (previous === undefined) {
    delete process.env.STELLAR_MAINNET_CONFIRM;
  } else {
    process.env.STELLAR_MAINNET_CONFIRM = previous;
  }
});

test("getStellarNetwork accepts public only with confirm", () => {
  const prevNet = process.env.STELLAR_NETWORK;
  const prevConfirm = process.env.STELLAR_MAINNET_CONFIRM;
  process.env.STELLAR_NETWORK = "public";
  process.env.STELLAR_MAINNET_CONFIRM = "YES";
  assert.equal(getStellarNetwork(), "public");
  if (prevNet === undefined) delete process.env.STELLAR_NETWORK;
  else process.env.STELLAR_NETWORK = prevNet;
  if (prevConfirm === undefined) delete process.env.STELLAR_MAINNET_CONFIRM;
  else process.env.STELLAR_MAINNET_CONFIRM = prevConfirm;
});

test("assertDeployNetwork refuses public with testnet USDC issuer", () => {
  const prevNet = process.env.STELLAR_NETWORK;
  const prevConfirm = process.env.STELLAR_MAINNET_CONFIRM;
  const prevIssuer = process.env.STELLAR_USDC_ISSUER;
  process.env.STELLAR_NETWORK = "public";
  process.env.STELLAR_MAINNET_CONFIRM = "YES";
  process.env.STELLAR_USDC_ISSUER =
    "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  try {
    assert.throws(() => assertDeployNetwork(), /testnet USDC/);
  } finally {
    if (prevNet === undefined) delete process.env.STELLAR_NETWORK;
    else process.env.STELLAR_NETWORK = prevNet;
    if (prevConfirm === undefined) delete process.env.STELLAR_MAINNET_CONFIRM;
    else process.env.STELLAR_MAINNET_CONFIRM = prevConfirm;
    if (prevIssuer === undefined) delete process.env.STELLAR_USDC_ISSUER;
    else process.env.STELLAR_USDC_ISSUER = prevIssuer;
  }
});
