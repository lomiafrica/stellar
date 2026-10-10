# Incident runbook

The lab ledger is JSON on the Railway volume mounted at `/data` (`STELLAR_DATA_DIR`). Keys stay in environment variables. The volume is what makes a 14-day reconcile window survive a deploy.

Three-way check: ledger row, Stellar RPC/Horizon, Bridge transfer status. A break is one of `ledger_without_chain`, `chain_without_ledger`, `bridge_incomplete`, `amount_mismatch`, `memo_mismatch`. Breaks are copied to the review queue and are not closed by a later clean run.

## Daily

The lab runs a reconcile when the process boots and again every `RECONCILE_CRON_HOURS` (default 24) while it stays up. Railway may sleep the service, so the GitHub Live workflow is the clock that wakes it: it POSTs `/ops/reconcile/run` and saves `/ops/reconcile/latest`.

By hand:

```bash
pnpm reconcile
curl -sS -X POST "$PUBLIC_BASE_URL/ops/reconcile/run" -H "X-Lab-Key: $LAB_API_KEY"
```

Read the log:

- `GET /ops/reconcile/latest`
- `GET /ops/reconcile/runs?days=14`
- `GET /ops/reconcile/review`

A browser gets the same pages as HTML. A clean window is 14 days of runs with no unexplained break, no extra ledger credit on a duplicate Bridge event, and k6 under the thresholds in `k6/payouts.js`.

## Stuck transaction

1. Look up `payout_id` in `data/stellar_settlements.json` or `GET /demo/payouts/:payout_id`.
2. If status is `processing` and `stellar_tx_hash` is set, wait for the timebounds (about 3 minutes) and retry the same `payout_id`. The retry polls the hash. It does not submit a second payment.
3. Horizon memo must equal the first 28 characters of `payout_id`.
4. Do not create a new memo. Reuse `payout_id`.
5. If Bridge completed and Stellar did not, do not credit the last mile.

## Missed webhook

1. `GET https://api.sandbox.bridge.xyz/v0/webhooks/$BRIDGE_WEBHOOK_ID/events` with the sandbox API key.
2. Resend one event with `POST /v0/webhooks/$BRIDGE_WEBHOOK_ID/send` and `{ "event_id": "…" }`, or `pnpm bridge:bootstrap` if the endpoint itself is missing.
3. The lab returns 400 for a bad signature and does not move the ledger. A duplicate event id returns 200 and leaves the ledger file unchanged.

## Manual reconciliation

1. `POST /ops/reconcile/run` with `X-Lab-Key`.
2. Open `GET /ops/reconcile/review`. An open item lists the payout id and the break codes.
3. Fix the cause (missing hash, wrong amount, Bridge still `awaiting_funds`). Run the job again. A clean run does not close the item.
4. Close it with a note:

```bash
curl -sS -X POST "$PUBLIC_BASE_URL/ops/reconcile/review/$PAYOUT_ID/close" \
  -H "X-Lab-Key: $LAB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"note":"hash matched Horizon; Bridge transfer completed"}'
```

## Key rotation

1. Generate a new testnet `G…` with `pnpm map` on a machine that does not hold the old seed in the shell history you are about to share.
2. Fund it and open the Circle testnet USDC trustline (`pnpm bootstrap` against the new `.env`).
3. Put the new `OMNIBUS_SECRET` on the lab service and redeploy. The volume keeps the ledger.
4. Update the Bridge virtual account destination if Bridge is connected.
5. Testnet secrets never go to mainnet. New mainnet keys: `STELLAR_NETWORK=public STELLAR_MAINNET_CONFIRM=YES pnpm mainnet:keys`.

## Alerts

`ALERT_WEBHOOK_URL` receives `{ "text": "…" }` (Slack incoming webhook). When it is unset, the same events are only JSON lines on stdout.

| Event | Meaning |
| --- | --- |
| `webhook.rejected` | Signature missing, stale, or invalid. No ledger write. |
| `reconcile.break` | A payout failed the three-way check. It is also in the review queue. |
| `tx.send_error` | Stellar rejected the payment, or the worker failed. |
| `tx.timeout` | The hash is still pending after the poll window. Retry the same payout id. |

Other lines (`quote.issued`, `quote.expired`, `tx.submitted`, `tx.confirmed`, `webhook.received`, `webhook.duplicate`, `reconcile.run`) are logs, not pages.

## Load

```bash
k6 run --summary-export k6/results/summary.json \
  -e STELLAR_LAB_URL="$PUBLIC_BASE_URL" \
  -e LAB_API_KEY="$LAB_API_KEY" \
  k6/payouts.js
```

See `k6/README.md`. Raise `LAB_MAX_USDC_PER_DAY` and fund the omnibus for the run, then restore the cap.

## Escalation

1. Babacar Diop, babacar@lomi.africa, Telegram @bm_diop.
2. Bridge support for sandbox access, webhook delivery, or a transfer id that will not leave `awaiting_funds`.
3. Stellar Developers Discord for an anchor or SEP-6/38 failure on testnet. No grant amounts in that post.

## Payout field

`GET /demo/payouts/:id` includes `stellar_transaction_id`. It is the same hash as `stellar_tx_hash`. Merchants can verify that payment on Stellar Expert.
