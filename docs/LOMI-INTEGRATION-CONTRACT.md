# Payout contract

How this lab’s HTTP matches the public lomi. payout API. This repo is a standalone testnet lab. It does not implement the hosted platform.

Public API reference: [docs.lomi.africa](https://docs.lomi.africa).

## Public payouts

Merchants create payouts with `POST /payouts`. Body fields this lab accepts:

| Field           | Notes                                                             |
| --------------- | ----------------------------------------------------------------- |
| `destination`   | `self` or `beneficiary`                                           |
| `rail`          | `stellar` in this lab (`wave` / `mtn` / `spi` / `bank` elsewhere) |
| `amount`        | Merchant-facing amount                                            |
| `currency_code` | Merchant ledger: `XOF`, `USD`, or `EUR`. Not USDC.                |
| `payout_id`     | Optional. Same id twice replays the existing on-chain Payment     |

Response: `success`, `payout_id`, `kind`, `status` (`pending` / `processing` / `completed` / `failed`), plus `stellar_tx_hash` and explorer URLs when a payment lands.

Header `Idempotency-Key` is scoped per caller. Header `X-Lab-Key` is required on the public lab (`LAB_API_KEY`).

USDC is the treasury hop on Stellar, not a merchant wallet currency.

## Lab mapping

### Local ledger: `data/stellar_settlements.json`

Lab-only JSON (gitignored). Fields the demo stores:

| Lab field                  | Meaning                                         |
| -------------------------- | ----------------------------------------------- |
| `organization_id`          | Caller organization                             |
| `environment`              | Always `test` in the lab                        |
| `payout_id`                | Public payout id                                |
| `destination`              | `self` / `beneficiary`                          |
| `last_mile_rail`           | Mock last mile: `wave` / `mtn` / `spi` / `bank` |
| `amount` + `currency_code` | Merchant-facing payout amount                   |
| `amount_usdc`              | On-chain hop size (Circle testnet USDC)         |
| `stellar_tx_hash`          | On-chain transaction id                         |
| `bridge_transfer_id`       | Mock Bridge treasury leg                        |
| `memo`                     | First 28 characters of `payout_id`              |
| `status`                   | Same lifecycle as the public payout status      |

### HTTP

| Lab endpoint                   | Public analogue                        |
| ------------------------------ | -------------------------------------- |
| `POST /demo/payouts`           | `POST /payouts` with `rail: "stellar"` |
| `GET /demo/payouts/:payout_id` | Payout status + reconcile snapshot     |
| `POST /demo/settle`            | Same orchestration as `/demo/payouts`  |
| Header `Idempotency-Key`       | Public API idempotency                 |
| Header `X-Lab-Key`             | Lab `LAB_API_KEY`                      |

### Orchestration

1. **pending**: create a row with `payout_id` (skip if already completed on-chain).
2. **processing**: mock Bridge `bridge_transfer_id`.
3. **On-chain**: USDC `Payment` omnibus to merchant; memo = payout id.
4. **completed**: mock Wave/MTN off-ramp; store `stellar_tx_hash`.
5. **failed**: mark failed if the payment fails (retry allowed).

`pnpm reconcile` checks Horizon/RPC success and memo against the local ledger.

## Later connect (not this lab)

1. Hosted `POST /payouts` with `rail: "stellar"` (allowlisted organizations, test first).
2. Do not add USDC as a merchant wallet currency.
3. Payout webhooks may include `stellar_transaction_id` and `bridge_transfer_id`.
4. Signing keys for the lab stay in this repo’s gitignored `keys/`.

## Non-goals (this lab repo)

- This lab does not call the hosted lomi. API
- No merchant key custody
- No mainnet or real Bridge / mobile-money calls

## Example request

```bash
curl -s -X POST http://localhost:3456/demo/payouts \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-key-001' \
  -H "X-Lab-Key: $LAB_API_KEY" \
  -d '{
    "destination": "self",
    "rail": "stellar",
    "amount": 10,
    "currency_code": "USD",
    "last_mile_rail": "wave"
  }'
```
