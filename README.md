# stellar

Testnet lab from [lomi.](https://lomi.africa) for custodial USDC settlement on Stellar.

lomi. is a payment processor for francophone West Africa. Merchants collect XOF over Wave, MTN, cards, and bank rails. This repo is a standalone NestJS app that tries the correspondent-banking hop as Circle USDC on Stellar Testnet: omnibus account, memo-keyed `Payment`, local ledger, payout-shaped HTTP.

It is not wired to lomi. live systems. Merchants never hold keys. We do not issue a stablecoin.

**Architecture:** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)  
**Payout mapping:** [docs/LOMI-INTEGRATION-CONTRACT.md](./docs/LOMI-INTEGRATION-CONTRACT.md)

## What is in here

- Friendbot-funded testnet accounts and Circle testnet USDC trustlines
- Omnibus to merchant USDC `Payment` with `memo` = payout id
- Local JSON ledger (`data/`, gitignored) for reconcile
- Nest demo on `:3456` shaped like `POST /payouts` with `rail: "stellar"`
- Mock Bridge treasury and mock last-mile (Wave / MTN / SPI)
- SEP-1 `stellar.toml` at `/.well-known/stellar.toml`

Not in this repo: Anchor Platform, HSM/KMS, mainnet keys, or calls into `apps/api`.

`pnpm install` does not need the lomi. monorepo.

## Requirements

- Node.js 20.11+
- pnpm

## Setup

```bash
pnpm install
cp .env.example .env
pnpm bootstrap
```

`pnpm bootstrap` reuses `keys/` if present, funds accounts via Friendbot, and opens Circle testnet USDC trustlines.

Current testnet accounts:

- Omnibus: `GD6PH2FAK5DQFFFALZVAT337R7NDGSPWT4R6UBGA5GYLL7N5U4C4GI7I`
- Merchant: `GAOHXCYCLGQDETU33F4AB5DZUSEPRHHEROJ3FCZ6I4S6MDV7FZQVVW2Y`

```bash
pnpm settle:10
pnpm proof
pnpm reconcile
```

`pnpm settle:10` submits a memo-keyed USDC payment if the omnibus has test USDC. `pnpm proof` prints stellar.expert links from `data/testnet-proof.json`.

Do not send mainnet USDC to these addresses.

## HTTP API

```bash
pnpm start:dev
```

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/demo/payouts` | Payout-shaped body + `rail: "stellar"`; optional `Idempotency-Key` |
| `GET` | `/demo/payouts/:payout_id` | Status + reconcile snapshot |
| `POST` | `/demo/settle` | Thin settle helper |
| `POST` | `/mock/bridge/fund` | Mock treasury credit |
| `GET` | `/.well-known/stellar.toml` | SEP-1 |

```json
{
  "destination": "self",
  "rail": "stellar",
  "amount": 10,
  "currency_code": "USD",
  "last_mile_rail": "wave"
}
```

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

CI on `main` runs the same plus `pnpm knip`. Tests cover JSON parsing, the local ledger, and idempotency. They do not need funded testnet USDC.

## Local data (gitignored)

| Path | Purpose |
| --- | --- |
| `data/stellar_settlements.json` | Settlement rows |
| `data/demo_idempotency.json` | Idempotency cache |
| `keys/` | Testnet signing keys (never commit) |

Committed public keys and explorer tx ids (no secrets): `data/testnet-proof.json`.

## Notes

- Custodial: demo keys stay on the operator machine.
- Memo is the payout id, truncated to Stellar memo limits.
- HTTP body matches lomi. `CreatePayoutDto` so a later `rail: "stellar"` can reuse the same shape.
- Bridge and last-mile adapters here are stubs.
- SCF #45 panel freeze: do not add Anchor Platform, real Bridge, or a production `POST /payouts` rail here until the award / Tranche 1 kickoff. The remaining lab close is Circle testnet USDC on the current omnibus, then `pnpm settle:10`.

## License

MIT. See [LICENSE](./LICENSE).
