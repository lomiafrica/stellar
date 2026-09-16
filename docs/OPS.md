# Incident runbook

Three-way reconcile: Postgres `stellar_settlements` vs Stellar RPC vs Bridge.

## Daily

```bash
pnpm reconcile
# Private API (cron):
curl -sS -X POST "$API_URL/internal/stellar/reconcile" \
  -H "x-cron-secret: $CRON_SECRET"
```

Load:

```bash
k6 run k6/payouts.js
```

A clean window is 14 days of matching hashes, no extra ledger credit on duplicate Bridge events, and k6 under the thresholds in `k6/payouts.js`.

## If a hop is missing on chain

1. Look up `payout_id` in the local ledger or `get_stellar_settlement`.
2. Horizon: memo must equal the first 28 chars of `payout_id`.
3. Do not replay with a new memo. Reuse `payout_id` (idempotent).
4. If Bridge completed but Stellar did not, do not credit last mile.

## If Bridge HMAC fails

Reject the webhook. Do not call `complete_stellar_settlement`. Tampered and missing signatures are unit-tested in the private API.

## Keys

Testnet secrets never go to mainnet. New `G…` keys: `STELLAR_NETWORK=public STELLAR_MAINNET_CONFIRM=YES pnpm mainnet:keys`.
