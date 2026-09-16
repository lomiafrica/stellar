import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifySep12Customer } from "../src/anchor/merchant-verify.js";

test("SEP-12 does not auto-accept unknown accounts", async () => {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-sep12-"));
  delete process.env.LOMI_MERCHANT_VERIFY_URL;
  delete process.env.SEP12_ACCEPTED_ACCOUNTS;
  const result = await verifySep12Customer({
    account: "GUNKNOWNACCOUNT000000000000000000000000000000000000",
  });
  assert.equal(result.status, "NEEDS_INFO");
});

test("SEP-12 accepts an allowlisted account", async () => {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), "stellar-sep12-"));
  const account = "GALLOWLISTACCOUNT0000000000000000000000000000000000";
  process.env.SEP12_ACCEPTED_ACCOUNTS = account;
  const result = await verifySep12Customer({ account, type: "sep24" });
  assert.equal(result.status, "ACCEPTED");
});
