# MIT adapter

This repo is MIT. Use it as a last-mile + memo-keyed Payment adapter.

```bash
pnpm install
cp .env.example .env
pnpm bootstrap
pnpm settle:10
pnpm reconcile
pnpm volume
```

`pnpm reconcile` walks `data/stellar_settlements.json` against Horizon. `pnpm volume` prints completed USDC hops and SEP-31 inbound counts.

Do not put merchant USDC on an `accounts` row. Memo is the payout id. Last mile stays Wave / MTN / SPI (sandbox in this lab).
