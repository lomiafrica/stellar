import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BridgeSandboxAdapter, mapBridgeStatus } from "../src/bridge/adapter.js";
import {
  BridgeApiError,
  BridgeClient,
  type BridgeHeaders,
} from "../src/bridge/client.js";

test("mapBridgeStatus treats payment_processed as completed", () => {
  assert.equal(mapBridgeStatus("payment_processed"), "completed");
  assert.equal(mapBridgeStatus("awaiting_funds"), "awaiting_funds");
  assert.equal(mapBridgeStatus("refunded"), "refunded");
  assert.equal(mapBridgeStatus("undeliverable"), "failed");
});

test("sandbox adapter creates a transfer through the injected client", async () => {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-bridge-ad-"));
  process.env.BRIDGE_CUSTOMER_ID = "cust_test";
  const calls: string[] = [];
  const client = new BridgeClient({
    apiKey: "test-key",
    baseUrl: "https://api.sandbox.bridge.xyz",
    fetchImpl: async (url, init) => {
      calls.push(`${init.method} ${url}`);
      // SAFETY: BridgeClient.request passes a plain header object, not a Headers instance.
      const headers = init.headers as BridgeHeaders;
      assert.equal(headers["Api-Key"], "test-key");
      if (init.method !== "GET") assert.ok(headers["Idempotency-Key"]);
      if (String(url).endsWith("/v0/transfers") && init.method === "POST") {
        return {
          ok: true,
          status: 201,
          text: async () =>
            JSON.stringify({
              id: "tr_1",
              amount: "10.0",
              state: "payment_processed",
              created_at: "2026-10-10T00:00:00.000Z",
            }),
        };
      }
      return {
        ok: false,
        status: 404,
        text: async () => "missing",
      };
    },
  });
  const adapter = new BridgeSandboxAdapter(client);
  const created = await adapter.createTransfer({ usdAmount: "10.0" });
  assert.equal(created.id, "tr_1");
  assert.equal(created.status, "completed");
  assert.match(calls[0] ?? "", /POST https:\/\/api.sandbox.bridge.xyz\/v0\/transfers/);
  await assert.rejects(
    () => client.getTransfer("missing"),
    (err) => err instanceof BridgeApiError && err.status === 404,
  );
  delete process.env.BRIDGE_CUSTOMER_ID;
});
