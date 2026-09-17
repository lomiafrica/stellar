import assert from "node:assert/strict";
import test from "node:test";
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  assertLabMutatingAuth,
  isPublicDeploy,
  secretsEqual,
} from "../src/http/lab-auth.js";

test("isPublicDeploy is false for localhost", () => {
  assert.equal(isPublicDeploy("http://localhost:3456", "development"), false);
  assert.equal(isPublicDeploy("http://127.0.0.1:3456", "production"), false);
});

test("isPublicDeploy is true for a public host", () => {
  assert.equal(
    isPublicDeploy("https://lab-production-5fac.up.railway.app", "production"),
    true,
  );
});

test("secretsEqual rejects different lengths without throwing", () => {
  assert.equal(secretsEqual("ab", "abc"), false);
  assert.equal(secretsEqual("abc", "abc"), true);
});

test("assertLabMutatingAuth is 503 when the public lab has no key", () => {
  const previousUrl = process.env.PUBLIC_BASE_URL;
  const previousKey = process.env.LAB_API_KEY;
  const previousEnv = process.env.NODE_ENV;
  process.env.PUBLIC_BASE_URL = "https://lab.example.test";
  process.env.NODE_ENV = "production";
  delete process.env.LAB_API_KEY;
  try {
    assert.throws(
      () => assertLabMutatingAuth(),
      (err: unknown) => err instanceof ServiceUnavailableException,
    );
  } finally {
    if (previousUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.LAB_API_KEY;
    else process.env.LAB_API_KEY = previousKey;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});

test("assertLabMutatingAuth is 401 on a bad key", () => {
  const previousKey = process.env.LAB_API_KEY;
  process.env.LAB_API_KEY = "expected-lab-key";
  try {
    assert.throws(
      () => assertLabMutatingAuth("wrong"),
      (err: unknown) => err instanceof UnauthorizedException,
    );
    assert.doesNotThrow(() => assertLabMutatingAuth("expected-lab-key"));
  } finally {
    if (previousKey === undefined) delete process.env.LAB_API_KEY;
    else process.env.LAB_API_KEY = previousKey;
  }
});
