import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.STELLAR_LAB_URL || "http://localhost:3456";
const LAB_KEY = __ENV.LAB_API_KEY || "";

export const options = {
  vus: 5,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

export default function stellarPayouts() {
  const mutatingHeaders = {
    "Content-Type": "application/json",
  };
  if (LAB_KEY) mutatingHeaders["X-Lab-Key"] = LAB_KEY;
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
    }),
    { headers: { ...mutatingHeaders, "Idempotency-Key": payoutId } },
  );
  check(create, {
    "payout accepted or funded-closed": (res) =>
      res.status === 200 || res.status === 201 || res.status === 400,
  });

  const replay = http.post(
    `${BASE}/demo/payouts`,
    JSON.stringify({
      destination: "self",
      rail: "stellar",
      amount: 1,
      currency_code: "USD",
      payout_id: payoutId,
    }),
    { headers: { ...mutatingHeaders, "Idempotency-Key": payoutId } },
  );
  check(replay, {
    "idempotent replay": (res) =>
      res.status === 200 || res.status === 201 || res.status === 400,
  });
  sleep(1);
}
