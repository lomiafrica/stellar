# lomi. payout mapping

How this lab mirrors lomi. payout and ledger fields without writing to Supabase or calling `apps/api`. A later `rail: 'stellar'` on `POST /payouts` should follow this.

## Production reference

| Concept | Location | Notes |
| --- | --- | --- |
| Merchant balances | `accounts` | `organization_id`, `currency_code` in `XOF`, `USD`, `EUR`, `balance` |
| Self withdrawals | `payouts` | `payout_id` UUID, `status` `pending` / `processing` / `completed` / `failed` |
| Beneficiary sends | `beneficiary_payouts` | Same status model |
| Create payout API | `apps/api` `POST /payouts` | `CreatePayoutDto`: `destination`, `rail` (`wave` / `mtn` / `spi` / `bank`), `amount`, `currency_code` |
| Response | `CreatePayoutResponseDto` | `success`, `payout_id`, `kind`, `status` |
| HTTP idempotency | `api_idempotency_records` | Header `Idempotency-Key` scoped per org + route |
| Settlement periods | `GET /settlements` | Virtual `settlement_id` = `{currency}:{YYYY-MM-DD}` from `transactions.available_at` |

USDC is not a merchant `currency_code` today. There is no `rail: 'stellar'` on the live API.

## Lab mapping

### Local table: `data/stellar_settlements.json`

Each row is the proposed `stellar_settlements` table plus payout join keys:

| Lab field | Production / future |
| --- | --- |
| `organization_id` | `accounts.organization_id` |
| `environment` | Always `test` in the lab |
| `payout_id` | `payouts.payout_id` |
| `destination` | `self` / `beneficiary` |
| `last_mile_rail` | Mock last mile: `wave` / `mtn` / `spi` / `bank` |
| `amount` + `currency_code` | Merchant-facing payout amount |
| `amount_usdc` | On-chain hop size (Circle testnet USDC) |
| `stellar_tx_hash` | Future webhook field `stellar_transaction_id` |
| `bridge_transfer_id` | Future Bridge treasury leg |
| `memo` | `payout_id.slice(0, 28)` (same idea as SPI `SPI-{payout_id}`) |
| `status` | Same lifecycle as `payouts.status` |

### HTTP

| Lab endpoint | Prod analogue |
| --- | --- |
| `POST /demo/payouts` | `POST /payouts` with `rail: 'stellar'` |
| `GET /demo/payouts/:payout_id` | Payout status + reconcile snapshot |
| `POST /demo/settle` | Same orchestration as `/demo/payouts` |
| Header `Idempotency-Key` | `api_idempotency_records` (local `data/demo_idempotency.json`) |

### Orchestration

1. **pending**: create row with `payout_id` (skip if already completed on-chain).
2. **processing**: mock Bridge `bridge_transfer_id`.
3. **On-chain**: USDC `Payment` omnibus to merchant; memo = payout ID.
4. **completed**: mock Wave/MTN off-ramp; store `stellar_tx_hash`.
5. **failed**: mark failed if RPC payment fails (retry allowed).

`pnpm reconcile` checks Horizon/RPC success and memo against the ledger row.

## Later (not in this repo)

1. **Migration**: `stellar_settlements` table (see [ARCHITECTURE.md](./ARCHITECTURE.md) §7).
2. **API**: add `'stellar'` to `CreatePayoutDto.rail`; feature flag per organization.
3. **Ledger**: do not add USDC to merchant `accounts` at first; treasury USDC stays off-ledger or on separate treasury accounts.
4. **Webhooks**: add `stellar_transaction_id`, `bridge_transfer_id` to payout events.
5. **Signing**: HSM/KMS instead of local `keys/` files.

## Non-goals

- No edits to `apps/api`, `apps/dashboard`, or Supabase migrations
- No merchant key custody
- No mainnet or real Bridge / mobile-money calls

## Example request

```bash
curl -s -X POST http://localhost:3456/demo/payouts \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-key-001' \
  -d '{
    "destination": "self",
    "rail": "stellar",
    "amount": 10,
    "currency_code": "USD",
    "last_mile_rail": "wave"
  }'
```

Response fields match `CreatePayoutResponseDto` plus `stellar_tx_hash` and explorer URLs when a payment lands.
