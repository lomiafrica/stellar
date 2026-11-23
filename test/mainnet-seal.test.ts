import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import test from "node:test";
import assert from "node:assert/strict";
import { sealStoredMainnetKey } from "../scripts/mainnet-seal.js";
import { AesGcmUnsealer } from "../src/stellar/signer.js";
import { TESTNET_OMNIBUS_PUBLIC_KEY } from "../src/http/stellar-toml.js";

function withKeyDir(publicKey: string, secret: string): string {
  const dir = mkdtempSync(join(tmpdir(), "t2-seal-"));
  mkdirSync(join(dir, "mainnet"), { recursive: true });
  writeFileSync(
    join(dir, "mainnet", "omnibus.json"),
    JSON.stringify({ publicKey, secret }),
  );
  return dir;
}

test("sealStoredMainnetKey seals the seed and it unseals back", async () => {
  const kp = Keypair.random();
  const dir = withKeyDir(kp.publicKey(), kp.secret());
  try {
    const sealed = sealStoredMainnetKey(dir);
    assert.equal(sealed.publicKey, kp.publicKey());
    assert.equal(Buffer.from(sealed.kek, "base64").length, 32);
    const unsealer = new AesGcmUnsealer(Buffer.from(sealed.kek, "base64"));
    const seed = await unsealer.unseal(
      Buffer.from(sealed.ciphertext, "base64"),
    );
    assert.equal(seed.toString("utf8"), kp.secret());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sealStoredMainnetKey refuses the testnet omnibus", () => {
  const dir = withKeyDir(TESTNET_OMNIBUS_PUBLIC_KEY, Keypair.random().secret());
  try {
    assert.throws(() => sealStoredMainnetKey(dir), /testnet omnibus/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sealStoredMainnetKey refuses without a key file", () => {
  const dir = mkdtempSync(join(tmpdir(), "t2-seal-empty-"));
  try {
    assert.throws(() => sealStoredMainnetKey(dir), /mainnet:keys/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
