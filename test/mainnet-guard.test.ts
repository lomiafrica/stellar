import assert from "node:assert/strict";
import test from "node:test";
import { assertMainnetAllowed, getStellarNetwork } from "../src/config.js";

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
