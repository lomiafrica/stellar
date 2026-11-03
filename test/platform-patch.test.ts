import assert from "node:assert/strict";
import test from "node:test";
import {
  patchPlatformTransaction,
  type PlatformFetch,
} from "../src/anchor/platform-patch.js";

const input = {
  transactionId: "c472c237-95bb-4ce1-a2cb-93fe8b32c655",
  status: "completed",
  message: "sandbox",
};

function withPlatformUrl(): () => void {
  process.env.PLATFORM_API_URL = "http://platform.test:8085";
  return () => {
    delete process.env.PLATFORM_API_URL;
  };
}

test("platform patch retries until the platform server is listening", async () => {
  const restore = withPlatformUrl();
  let calls = 0;
  const slept: number[] = [];
  const fetchImpl: PlatformFetch = async (url, init) => {
    calls += 1;
    assert.equal(url, "http://platform.test:8085/transactions");
    assert.equal(init.method, "PATCH");
    if (calls === 1) throw new Error("connect ECONNREFUSED");
    if (calls === 2) {
      return { ok: false, status: 502, text: async () => "Bad Gateway" };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };
  const result = await patchPlatformTransaction(input, {
    fetchImpl,
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 3);
  assert.deepEqual(slept, [1_000, 2_000]);
  restore();
});

test("platform patch does not retry a 4xx", async () => {
  const restore = withPlatformUrl();
  let calls = 0;
  const result = await patchPlatformTransaction(input, {
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 400, text: async () => "bad status" };
    },
    sleep: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.match(result.detail, /^400 /);
  restore();
});

test("platform patch gives up after the last retry", async () => {
  const restore = withPlatformUrl();
  let calls = 0;
  const result = await patchPlatformTransaction(input, {
    fetchImpl: async () => {
      calls += 1;
      throw new Error("connect ECONNREFUSED");
    },
    sleep: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 5);
  assert.match(result.detail, /ECONNREFUSED/);
  restore();
});
