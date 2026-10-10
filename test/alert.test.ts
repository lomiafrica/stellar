import assert from "node:assert/strict";
import test from "node:test";
import { notifyAlert, setAlertFetch } from "../src/ops/alert.js";

test("alert posts slack-shaped text when a URL is set", async () => {
  process.env.ALERT_WEBHOOK_URL = "https://alerts.example.test/hook";
  let seen = "";
  setAlertFetch(async (_url, init) => {
    seen = String(init.body ?? "");
    return { ok: true };
  });
  const ok = await notifyAlert("webhook.rejected", {
    reason: "invalid signature",
  });
  assert.equal(ok, true);
  assert.match(seen, /webhook.rejected/);
  assert.match(seen, /invalid signature/);
  setAlertFetch(undefined);
  delete process.env.ALERT_WEBHOOK_URL;
});

test("missing alert URL does not throw", async () => {
  delete process.env.ALERT_WEBHOOK_URL;
  setAlertFetch(async () => {
    throw new Error("should not be called");
  });
  const ok = await notifyAlert("reconcile.break", { payout_id: "x" });
  assert.equal(ok, false);
  setAlertFetch(undefined);
});
