import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  readJwtDataString,
  readJwtString,
  verifyHs256Jwt,
} from "../src/anchor/jwt.js";
import type { JsonObject } from "../src/json.js";

function sign(payload: JsonObject, secret: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

test("verifyHs256Jwt accepts a valid token and rejects a bad signature", () => {
  const secret = "sep24-test-secret";
  const token = sign(
    {
      sub: "GTEST",
      data: { transaction_id: "tx-1", amount: "1000" },
    },
    secret,
  );
  const payload = verifyHs256Jwt(token, secret);
  assert.ok(payload);
  assert.equal(readJwtString(payload, "sub"), "GTEST");
  assert.equal(readJwtDataString(payload, "transaction_id"), "tx-1");
  assert.equal(verifyHs256Jwt(token, "other"), null);
});
