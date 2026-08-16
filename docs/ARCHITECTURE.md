# Technical architecture: USDC settlement (lomi.)

**Repo:** [github.com/lomiafrica/stellar](https://github.com/lomiafrica/stellar)  
**Company:** LOMI. TECHNOLOGIES AFRICA SA (Abidjan)  
**Network:** Stellar Testnet

lomi. processes merchant payments in UEMOA (XOF). This repo is a standalone NestJS lab for a custodial Circle USDC hop on Stellar: same payout model we already run, merchants never hold keys.

A later rail would use Bridge for USD/USDC treasury and Stellar Anchor Platform for the XOF SEP stack. Neither is deployed here.

## 1. Goal

Replace the correspondent-banking XOF to USD leg with Circle USDC on Stellar, while:

- merchants keep Wave / MTN / SPI / card UX
- the merchant ledger stays XOF | USD | EUR (USDC is treasury, not a wallet currency)
- every on-chain `Payment` is reconcilable via `memo = payout_id`
- the HTTP surface matches `POST /payouts` so `rail: "stellar"` does not invent a second API

This app is isolated from `apps/api` and Supabase on purpose.

## 2. System overview

```
Merchant UX (unchanged)
  checkout / dashboard / API / MCP: Wave, MTN, SPI, cards
                 |
                 v
lomi. NestJS API + Postgres ledger
  accounts (XOF|USD|EUR) · payouts · idempotency · webhooks

This lab (testnet)
  POST /demo/payouts  rail = stellar
        |                              |
        v                              v
   mock Bridge                    Stellar classic
   USD <-> USDC                   Omnibus custodial USDC
   (stub)                         Payment + memo = payout_id
                                  SEP-1 toml in-repo
```

If we wire this into the live API later: feature-flagged `rail: stellar`, real Bridge, Anchor Platform for XOF SEPs. Field map: [LOMI-INTEGRATION-CONTRACT.md](./LOMI-INTEGRATION-CONTRACT.md).

| Building block | Role | In this repo |
| --- | --- | --- |
| Circle USDC | Settlement asset (consume, do not issue) | Testnet trustlines |
| Stellar classic payments | Omnibus to merchant, memo = payout id | Implemented |
| Bridge | USD <-> USDC treasury | Mock adapter |
| Stellar Anchor Platform | XOF on/off-ramp SEP stack | Not deployed |

## 3. What runs today

Isolated NestJS app. Clone and run without the lomi. monorepo.

| Capability | Status |
| --- | --- |
| Friendbot XLM + Circle USDC trustlines | On testnet |
| Memo-keyed USDC Payment (omnibus to merchant) | `pnpm settle:10` |
| Local `stellar_settlements.json` ledger | Snake_case fields for a later Postgres table |
| `POST /demo/payouts` (`rail: stellar`) | Mirrors `CreatePayoutDto` |
| Mock Bridge + mock Wave off-ramp | Stubs |
| SEP-1 `stellar.toml` | In repo / local HTTP |

**Testnet accounts**

- Omnibus: https://stellar.expert/explorer/testnet/account/GD6PH2FAK5DQFFFALZVAT337R7NDGSPWT4R6UBGA5GYLL7N5U4C4GI7I
- Merchant: https://stellar.expert/explorer/testnet/account/GAOHXCYCLGQDETU33F4AB5DZUSEPRHHEROJ3FCZ6I4S6MDV7FZQVVW2Y
- Create merchant: https://stellar.expert/explorer/testnet/tx/e96251153bdc95d2adc790438251bf2fbcffde2e1c900b3dea888b9c2c1ba4bd
- Trustline (omnibus): https://stellar.expert/explorer/testnet/tx/373a81110a922f41648f79fd512973a536958111e525d5987081f9a3c2df8c2a
- Trustline (merchant): https://stellar.expert/explorer/testnet/tx/f88d3263680ef113753a18aa756c07d806d8a2e08938b5d110a11de3b72f2605

Public keys and tx ids: [`data/testnet-proof.json`](../data/testnet-proof.json). Reproduce: `pnpm bootstrap` then `pnpm settle:10` then `pnpm proof`.

## 4. Settlement flow

1. Merchant earns XOF via Wave / MTN / PI-SPI, credit `accounts` (XOF or USD).
2. Payout with `rail: stellar` (org feature flag). In this lab: `POST /demo/payouts`.
3. Treasury holds Circle USDC on Stellar (Bridge mocked here).
4. Omnibus signs USDC `Payment` to the destination custodial account. Memo is the first 28 chars of `payout_id`.
5. Last mile stays Wave / MTN / SPI / bank (mocked here).
6. Webhooks would carry `stellar_transaction_id` and `bridge_transfer_id`.
7. Reconcile: Postgres <-> Stellar RPC <-> bank/MM. Lab: JSON ledger <-> RPC/Horizon.

Merchants never see wallets or keys.

## 5. SEP map

| SEP | Lab | Later |
| --- | --- | --- |
| SEP-1 | `stellar.toml` + XOF metadata | Hosted toml with XOF fiat metadata |
| SEP-10 | Not here | Wallet / anchor auth |
| SEP-12 | Not here | KYC/KYB via existing merchant verification |
| SEP-24 | Not here | Interactive deposit/withdraw to Wave/MTN |
| SEP-6 | Not here | Programmatic deposit/withdraw |
| SEP-38 | Not here | XOF/USDC quotes (XOF pegged to EUR) |
| SEP-31 | Not here | UEMOA receiving corridor |

No Soroban. Classic payments, then Anchor Platform if we take the rail live.

## 6. Stellar RPC

Prefer Stellar RPC (Horizon is in maintenance for new features):

- `sendTransaction` / `getTransaction` (poll ~2s, timeout ~30s)
- `getLedgerEntries` for balances / trustlines
- `getLatestLedger`, `getFeeStats`
- No `simulateTransaction` (no Soroban)

Testnet USDC issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`  
Mainnet USDC issuer: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`

## 7. Data model

Lab file `data/stellar_settlements.json` uses the same fields we would put on a `stellar_settlements` table:

```
id, organization_id, environment,
payout_id, destination, last_mile_rail,
amount, currency_code, amount_usdc,
stellar_tx_hash, bridge_transfer_id, memo,
status (pending|processing|completed|failed),
created_at, updated_at
```

Merchant ledger currencies stay XOF | USD | EUR. USDC is the treasury hop.

Idempotency: same `payout_id` means at most one on-chain Payment (same idea as `api_idempotency_records`).

## 8. Custody

- Omnibus / custodial. Merchants never hold secrets.
- A live rail would use HSM/KMS signing, Stellar multisig on treasury, velocity limits, dual-control above threshold.
- Lab: local gitignored testnet keys only.

## 9. Dependencies

| Dependency | Role | Here vs later |
| --- | --- | --- |
| Circle USDC | Settlement asset | Testnet; consume only, never issue |
| Bridge | USD <-> USDC | Mock now; later HMAC webhooks + dedupe |
| Anchor Platform (SDF) | SEP stack | Not in this repo |
| Wave / MTN / SPI | Last mile | Live in lomi.; mocked here |
| BCEAO | Regulatory | PI licence application in progress; MoR under partner banks |

## 10. If we take this live

1. Keep this repo public: memo-keyed payments, ledger, reconcile, SEP-1.
2. XOF Anchor on testnet: Anchor Platform (SEP-1/10/12/24), last mile on rails we already run.
3. `rail: stellar` on POST /payouts: same DTO, feature-flagged, HSM/KMS, idempotent replay.
4. Bridge + SEP-6/38 + three-way reconcile.
5. Mainnet, merchant pilot, optional SEP-31 receiving corridor. Still custodial. Still no merchant wallets.

## 11. Regulatory

- We do not issue a fiat-backed token. We consume Circle USDC and would anchor XOF as a deposit claim.
- BCEAO payment institution licence application in progress. We operate as Merchant-of-Record under partner banking arrangements.
