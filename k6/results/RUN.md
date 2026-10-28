# k6 run, 28 Oct 2026

Lab: https://lab-production-5fac.up.railway.app at commit `5f1c0cf`. Stellar testnet, Bridge sandbox. k6 v2.3.0.

```bash
k6 run -e STELLAR_LAB_URL=https://lab-production-5fac.up.railway.app \
  -e LAB_API_KEY="$LAB_API_KEY" \
  --summary-export k6/results/summary.json k6/payouts.js
```

50 virtual users for 70 seconds. Pool of 5 payout ids (`k6-mvsdi997-0` to `-4`). `LAB_RATE_LIMIT_PER_MINUTE` was raised for the run and deleted after it.

| Threshold                   | Limit   | Result   |
| --------------------------- | ------- | -------- |
| Failed requests             | < 1%    | 0.00%    |
| p95 of `POST /demo/payouts` | < 500ms | 468.51ms |
| Checks                      | > 99%   | 100.00%  |

3,733 payout creates and 3,733 toml reads. 0 failed out of 7,472 requests.

Each id ended `completed` with exactly one omnibus payment on testnet Horizon:

| Payout id       | Stellar transaction                                                |
| --------------- | ------------------------------------------------------------------ |
| `k6-mvsdi997-0` | `0603070bd9ffc1035efc56c31bdf671de72bfd21d253257120ddd4a542e3f297` |
| `k6-mvsdi997-1` | `d3c1cbc06ab8570d8765b6518a45db683f3c822cbe8b0ca94f33d127a6349eb7` |
| `k6-mvsdi997-2` | `badde36cb123979694413802623177198ba219cb92e37ba4f8f5f737d95a0f27` |
| `k6-mvsdi997-3` | `bc86cb69351bd7efbf085eb315c05a22b1a02a3197f987404604651e0f415f9e` |
| `k6-mvsdi997-4` | `06db3fee93076aeeec2b0bf1f2dd94cf94038824b628baa534c8bcd1d87d985d` |

## What the first two runs found

The first run, at `1051b88`, built the id pool in k6 init code, which runs once per virtual user, so it made 25 ids instead of 5 and spent the 9 testnet USDC. It also showed that parallel sends from the omnibus get `TRY_AGAIN_LATER`: Stellar admits one pending transaction per source account. Three payouts were left `processing` with a hash that never landed.

Fixed in `bcbe452`: sends from one account go one at a time, reconcile fails a built payment that RPC and Horizon both do not know past its time bounds (no break), a failed row is a break only if it was paid, and a failed request frees its idempotency key. No id was paid twice in any run.

The second run, at `bcbe452`, paid each id once but scored every replay as a failure, because Nest answered it `201 Created`. Fixed in `5f1c0cf`: a replay answers `200` with `Idempotent-Replayed: true`.
