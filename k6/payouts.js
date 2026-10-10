import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.STELLAR_LAB_URL || "http://localhost:3456";
const LAB_KEY = __ENV.LAB_API_KEY || "";
const startedAt = new Date().toISOString();

export const options = {
  scenarios: {
    payouts: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 100 },
        { duration: "30s", target: 100 },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:create}": ["p(95)<500"],
  },
};

function headers(extra) {
  const out = {
    "Content-Type": "application/json",
    Prefer: "respond-async",
    ...extra,
  };
  if (LAB_KEY) out["X-Lab-Key"] = LAB_KEY;
  return out;
}

export default function stellarPayouts() {
  const toml = http.get(`${BASE}/.well-known/stellar.toml`);
  check(toml, {
    "toml 200": (res) => res.status === 200,
    "toml has XOF": (res) => String(res.body).includes('code = "XOF"'),
  });

  const payoutId = `k6-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
      headers: headers({ "Idempotency-Key": payoutId }),
      tags: { name: "create" },
    },
  );
  check(create, {
    "async accepted": (res) => res.status === 202 || res.status === 200,
  });
  sleep(0.2);
}

export function teardown() {
  const list = http.get(
    `${BASE}/demo/payouts?since=${encodeURIComponent(startedAt)}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const body = list.json();
  const rows = body && body.payouts ? body.payouts : [];
  const seen = {};
  const hashes = {};
  let duplicate = false;
  for (const row of rows) {
    if (seen[row.payout_id]) duplicate = true;
    seen[row.payout_id] = true;
    const hash = row.stellar_transaction_id || row.stellar_tx_hash || "";
    if (!hash) continue;
    if (hashes[hash]) duplicate = true;
    hashes[hash] = true;
  }
  if (duplicate) {
    throw new Error("duplicate on-chain transaction in payout list");
  }
}
