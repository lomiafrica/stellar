import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleBridgeWebhook } from "../src/bridge/webhook-handler.js";
import { getLedgerPath, upsertSettlement } from "../src/ledger/store.js";

function isolate(): void {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-act-"));
  delete process.env.ALERT_WEBHOOK_URL;
}

function headerFor(
  rawBody: string,
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  timestamp: number,
): string {
  const digest = createHash("sha256")
    .update(`${timestamp}.${rawBody}`)
    .digest();
  const signature = sign("sha256", digest, privateKey).toString("base64");
  return `t=${timestamp},v0=${signature}`;
}

test("duplicate Bridge activity does not change the ledger", () => {
  isolate();
  upsertSettlement({
    id: "row-1",
    organization_id: "00000000-0000-4000-8000-000000000001",
    environment: "test",
    payout_id: "payout-bridge",
    destination: "self",
    last_mile_rail: "wave",
    amount: 1,
    currency_code: "USD",
    amount_usdc: "1",
    bridge_transfer_id: "dep_1",
    memo: "payout-bridge",
    status: "completed",
    created_at: "2026-10-10T00:00:00.000Z",
    updated_at: "2026-10-10T00:00:00.000Z",
  });
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const body = JSON.stringify({
    event_id: "evt_link",
    event_category: "virtual_account.activity",
    event_object: { id: "dep_1", deposit_id: "dep_1" },
  });
  const now = Date.now();
  const header = headerFor(body, privateKey, now);
  const first = handleBridgeWebhook(body, header, { publicKeyPem: pem, now });
  assert.equal(first.status, 200);
  assert.equal(first.body.duplicate, undefined);
  const afterFirst = readFileSync(getLedgerPath());
  const second = handleBridgeWebhook(body, header, { publicKeyPem: pem, now });
  assert.equal(second.body.duplicate, true);
  const afterSecond = readFileSync(getLedgerPath());
  assert.ok(afterFirst.equals(afterSecond));
});
