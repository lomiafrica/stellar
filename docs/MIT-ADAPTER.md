# MIT adapter

This repo is MIT. It is a last-mile and memo-keyed Payment adapter for the testnet lab. The mainnet toml and `anchor/config/anchor-config.mainnet.yaml` are in the repo and are not deployed.

```bash
pnpm install
cp .env.example .env
pnpm bootstrap
pnpm settle:10
pnpm sep6:replay
pnpm reconcile
pnpm volume
```

`pnpm bootstrap` funds the testnet accounts and opens the Circle testnet USDC trustline. `pnpm sep6:replay` runs SEP-10, a SEP-38 quote, and SEP-6 deposit and withdraw against the public anchor. `pnpm reconcile` walks `data/stellar_settlements.json` against Horizon. `pnpm volume` prints completed USDC hops and SEP-31 inbound counts.

Do not treat USDC as a merchant wallet currency. The memo is the payout id. Last mile stays Wave, MTN, or SPI (sandbox in this lab).

The file the lab serves is `public/stellar.toml` (`Test SDF Network`). See [MAINNET.md](./MAINNET.md) for the flip that has not been made.
