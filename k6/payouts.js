import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.STELLAR_LAB_URL || "http://localhost:3456";
const LAB_KEY = __ENV.LAB_API_KEY || "";
const POOL_SIZE = Number(__ENV.K6_PAYOUT_POOL || "5");
const HORIZON = __ENV.HORIZON_URL || "https://horizon-testnet.stellar.org";
const OMNIBUS =
  __ENV.OMNIBUS_PUBLIC_KEY ||
  "GD6PH2FAK5DQFFFALZVAT337R7NDGSPWT4R6UBGA5GYLL7N5U4C4GI7I";
const accepted = http.expectedStatuses(200, 202, 409);

export const options = {
  teardownTimeout: "180s",
  scenarios: {
    payouts: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 50 },
        { duration: "45s", target: 50 },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:create}": ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

function headers(payoutId) {
  const out = {
    "Content-Type": "application/json",
    Prefer: "respond-async",
    "Idempotency-Key": payoutId,
  };
  if (LAB_KEY) out["X-Lab-Key"] = LAB_KEY;
  return out;
}

/** k6 runs init code once per VU, so the shared id pool is built here, once. */
export function setup() {
  const run = `k6-${Date.now().toString(36)}`;
  return { pool: Array.from({ length: POOL_SIZE }, (_, i) => `${run}-${i}`) };
}

/**
 * Every request reuses one of POOL_SIZE payout ids, so thousands of
 * concurrent creates must still produce one chain payment per id.
 * 409 is the lab saying that id is already in flight.
 */
export default function stellarPayouts({ pool }) {
  const toml = http.get(`${BASE}/.well-known/stellar.toml`, {
    tags: { name: "toml" },
  });
  check(toml, { "toml 200": (res) => res.status === 200 });

  const payoutId = pool[Math.floor(Math.random() * pool.length)];
  const create = http.post(
    `${BASE}/demo/payouts`,
    JSON.stringify({
      destination: "self",
      rail: "stellar",
      amount: 1,
      currency_code: "USD",
      payout_id: payoutId,
      async: true,
    }),
    {
      headers: headers(payoutId),
      tags: { name: "create" },
      responseCallback: accepted,
    },
  );
  check(create, {
    "accepted, replayed, or in flight": (res) =>
      res.status === 200 || res.status === 202 || res.status === 409,
  });
  sleep(0.2);
}

export function teardown({ pool }) {
  sleep(90);
  const hashesById = {};
  for (const payoutId of pool) {
    const res = http.get(`${BASE}/demo/payouts/${payoutId}`, {
      headers: { Accept: "application/json" },
      tags: { name: "readback" },
    });
    const row = res.status === 200 ? res.json() : {};
    hashesById[payoutId] =
      row.stellar_transaction_id || row.stellar_tx_hash || "";
    console.log(
      `${payoutId} ${row.status || res.status} ${hashesById[payoutId]}`,
    );
  }
  const hashes = Object.values(hashesById).filter(Boolean);
  if (new Set(hashes).size !== hashes.length) {
    throw new Error("two payout ids share one on-chain transaction");
  }

  const chain = http.get(
    `${HORIZON}/accounts/${OMNIBUS}/transactions?order=desc&limit=200`,
    { tags: { name: "horizon" } },
  );
  const records = chain.status === 200 ? chain.json("_embedded.records") : [];
  for (const payoutId of pool) {
    const onChain = records.filter(
      (tx) => tx.successful && tx.memo === payoutId.slice(0, 28),
    ).length;
    console.log(`${payoutId} chain payments ${onChain}`);
    if (onChain !== 1) {
      throw new Error(`${payoutId} was paid ${onChain} times on chain`);
    }
  }
}
