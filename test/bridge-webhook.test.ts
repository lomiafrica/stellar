import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleBridgeWebhook } from "../src/bridge/webhook-handler.js";
import { parseSignatureHeader, verifyBridgeSignature } from "../src/bridge/webhook.js";

function isolate(): string {
  const dir = mkdtempSync(join(tmpdir(), "stellar-bridge-"));
  process.env.STELLAR_DATA_DIR = dir;
  return dir;
}

function pair() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

function headerFor(rawBody: string, privateKey: ReturnType<typeof pair>["privateKey"], timestamp: number): string {
  const digest = createHash("sha256").update(`${timestamp}.${rawBody}`).digest();
  const signature = sign("sha256", digest, privateKey).toString("base64");
  return `t=${timestamp},v0=${signature}`;
}

test("parseSignatureHeader reads t and v0", () => {
  const parsed = parseSignatureHeader("t=1700000000000,v0=abc+def==");
  assert.deepEqual(parsed, { timestamp: "1700000000000", signature: "abc+def==" });
});

test("valid signature is accepted", () => {
  isolate();
  const { publicKey, privateKey } = pair();
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const body = JSON.stringify({ id: "evt_1", type: "transfer.updated" });
  const now = Date.now();
  const header = headerFor(body, privateKey, now);
  const result = verifyBridgeSignature(body, header, pem, now);
  assert.equal(result.ok, true);
});

test("tampered body is rejected", () => {
  const { publicKey, privateKey } = pair();
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const now = Date.now();
  const header = headerFor(JSON.stringify({ id: "evt_1" }), privateKey, now);
  const result = verifyBridgeSignature(
    JSON.stringify({ id: "evt_2" }),
    header,
    pem,
    now,
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid signature");
});

test("stale timestamp is rejected", () => {
  const { publicKey, privateKey } = pair();
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const body = JSON.stringify({ id: "evt_1" });
  const now = Date.now();
  const header = headerFor(body, privateKey, now - 11 * 60 * 1000);
  const result = verifyBridgeSignature(body, header, pem, now);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "stale timestamp");
});

test("missing header is rejected", () => {
  const { publicKey } = pair();
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const result = verifyBridgeSignature("{}", "", pem);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing signature");
});

test("unset public key returns 503", () => {
  isolate();
  delete process.env.BRIDGE_WEBHOOK_PUBLIC_KEY;
  const result = handleBridgeWebhook("{}", "t=1,v0=abc", { publicKeyPem: "" });
  assert.equal(result.status, 503);
});

test("duplicate event id is a no-op 200", () => {
  isolate();
  const { publicKey, privateKey } = pair();
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const body = JSON.stringify({ id: "evt_dup", type: "transfer.updated" });
  const now = Date.now();
  const header = headerFor(body, privateKey, now);
  const first = handleBridgeWebhook(body, header, { publicKeyPem: pem, now });
  const second = handleBridgeWebhook(body, header, { publicKeyPem: pem, now });
  assert.equal(first.status, 200);
  assert.equal(first.body.duplicate, undefined);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
});
