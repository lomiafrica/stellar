import assert from "node:assert/strict";
import test from "node:test";
import {
  callbackAuthOk,
  toCallbackCustomer,
} from "../src/anchor/callback-customer.js";
import { readSep12PutEmail } from "../src/anchor/merchant-verify.js";

test("toCallbackCustomer nests NEEDS_INFO fields for the platform callback API", () => {
  const body = toCallbackCustomer({
    id: "G1",
    account: "G1",
    status: "NEEDS_INFO",
    message: "Unknown account.",
    type: "sep24",
    fields: { email: "Merchant email on lomi." },
  });
  assert.equal(body.status, "NEEDS_INFO");
  assert.equal(body.fields?.email?.type, "string");
  assert.equal(body.fields?.email?.optional, false);
});

test("toCallbackCustomer omits fields when ACCEPTED", () => {
  const body = toCallbackCustomer({
    id: "G1",
    account: "G1",
    status: "ACCEPTED",
    message: "ok",
    type: "sep24",
  });
  assert.equal(body.status, "ACCEPTED");
  assert.equal(body.fields, undefined);
});

test("readSep12PutEmail reads email, email_address, or fields.email", () => {
  assert.equal(readSep12PutEmail({ email: "a@b.test" }), "a@b.test");
  assert.equal(readSep12PutEmail({ email_address: "c@d.test" }), "c@d.test");
  assert.equal(
    readSep12PutEmail({ fields: { email: "e@f.test" } }),
    "e@f.test",
  );
  assert.equal(readSep12PutEmail({}), undefined);
});

test("callbackAuthOk fails closed when public and secret is unset", () => {
  const previousSecret = process.env.CALLBACK_AUTH_SECRET;
  const previousUrl = process.env.PUBLIC_BASE_URL;
  const previousEnv = process.env.NODE_ENV;
  delete process.env.CALLBACK_AUTH_SECRET;
  process.env.PUBLIC_BASE_URL = "https://lab.example.test";
  process.env.NODE_ENV = "production";
  try {
    assert.equal(callbackAuthOk("anything"), false);
  } finally {
    if (previousSecret === undefined) delete process.env.CALLBACK_AUTH_SECRET;
    else process.env.CALLBACK_AUTH_SECRET = previousSecret;
    if (previousUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previousUrl;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});

test("callbackAuthOk accepts X-Api-Key or Bearer when secret is set", () => {
  const previous = process.env.CALLBACK_AUTH_SECRET;
  process.env.CALLBACK_AUTH_SECRET = "lab-secret";
  try {
    assert.equal(callbackAuthOk("lab-secret"), true);
    assert.equal(callbackAuthOk(undefined, "Bearer lab-secret"), true);
    assert.equal(callbackAuthOk("nope"), false);
  } finally {
    if (previous === undefined) delete process.env.CALLBACK_AUTH_SECRET;
    else process.env.CALLBACK_AUTH_SECRET = previous;
  }
});
