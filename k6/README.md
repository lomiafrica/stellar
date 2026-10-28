# Load test

50 virtual users for a minute on `POST /demo/payouts` with `Prefer: respond-async`. Every request reuses one of 5 payout ids, so the run is a load test and an idempotency test at once: thousands of concurrent creates, one chain payment per id. A `409` means that id is already in flight, and a `200` with `Idempotent-Replayed: true` means it already has an answer. Both are right for a duplicate.

The lab allows 60 writes per minute per client. Raise it for the run, then remove the variable:

```bash
LAB_RATE_LIMIT_PER_MINUTE=100000   # set on the lab service, then delete after the run
```

The omnibus needs 1 testnet USDC per pool id (5 by default).

```bash
k6 run \
  -e STELLAR_LAB_URL=https://lab-production-5fac.up.railway.app \
  -e LAB_API_KEY="$LAB_API_KEY" \
  --summary-export k6/results/summary.json \
  k6/payouts.js
```

Thresholds: failed requests under 1 percent (`200`, `202`, and `409` count as answered), p95 of the create call under 500ms, checks above 99 percent. Teardown waits 90 seconds, reads each pool id back from the lab, and counts the omnibus transactions on testnet Horizon that carry that id as memo. Anything but exactly one fails the run.

`k6/results/summary.json` and `k6/results/RUN.md` are the committed result.
