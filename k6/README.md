# Load test

100 concurrent payout accepts at the HTTP boundary. Settlement continues in the lab worker, so the measured time is the accept, not the Stellar round trip.

Raise the lab caps for the run, fund the omnibus with testnet USDC, then put the caps back.

```bash
k6 run \
  -e STELLAR_LAB_URL=https://lab-production-5fac.up.railway.app \
  -e LAB_API_KEY="$LAB_API_KEY" \
  k6/payouts.js
```

Thresholds in `k6/payouts.js`: failed requests under 1 percent, p95 of the create call under 500ms. Teardown reads `GET /demo/payouts?since=` and fails if one payout id or one transaction hash appears twice.

k6 writes `k6/results/summary.json` when you add:

```bash
k6 run --summary-export k6/results/summary.json k6/payouts.js
```

That file is the result to attach to the tranche form. It is gitignored.
