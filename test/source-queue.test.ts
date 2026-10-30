import assert from "node:assert/strict";
import test from "node:test";
import { oneAtATime } from "../src/stellar/source-queue.js";

function later<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

test("sends from one account never overlap, and a failure does not block the next", async () => {
  let running = 0;
  let peak = 0;
  const order: string[] = [];
  const job =
    (name: string, fail = false) =>
    async () => {
      running += 1;
      peak = Math.max(peak, running);
      await later(10, null);
      order.push(name);
      running -= 1;
      if (fail) throw new Error(name);
      return name;
    };

  const results = await Promise.allSettled([
    oneAtATime("GA", job("a")),
    oneAtATime("GA", job("b", true)),
    oneAtATime("GA", job("c")),
  ]);
  assert.equal(peak, 1);
  assert.deepEqual(order, ["a", "b", "c"]);
  assert.equal(results[1]?.status, "rejected");
  assert.equal(results[2]?.status, "fulfilled");
});

test("different accounts run side by side", async () => {
  let running = 0;
  let peak = 0;
  const job = async () => {
    running += 1;
    peak = Math.max(peak, running);
    await later(10, null);
    running -= 1;
  };
  await Promise.all([oneAtATime("GA", job), oneAtATime("GB", job)]);
  assert.equal(peak, 2);
});
