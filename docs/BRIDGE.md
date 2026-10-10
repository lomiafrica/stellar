# Bridge sandbox

Bridge owns the USD leg. This lab owns the Stellar testnet USDC hop.

Sandbox (`https://api.sandbox.bridge.xyz`) does not deliver USDC on Stellar testnet, does not move real money, and does not fire payment webhooks on its own. Virtual accounts and transfers are dummy objects with real ids. Webhook delivery is `POST /v0/webhooks/{id}/send`, plus the signed replay tests in this repo.

When `BRIDGE_API_KEY` is set, `getBridgeAdapter()` uses the sandbox client. Otherwise the mock adapter stays in place. The mock id looks like `bridge_mock_…`.

## What each side does

| Step                                              | Owner                      |
| ------------------------------------------------- | -------------------------- |
| Customer, KYC approval, USD virtual account       | Bridge sandbox             |
| Transfer id for the USD amount                    | Bridge sandbox             |
| USDC payment on Stellar testnet, memo = payout id | Lab omnibus                |
| Webhook signature check and event-id dedupe       | Lab `POST /bridge/webhook` |
| XOF collect and payout instruction                | Wave / MTN / SPI sandbox   |

A virtual account destination is `payment_rail: stellar`, `currency: usdc`, the omnibus `G…` address, and a memo. Bridge will not broadcast that payment in sandbox. The lab submits the testnet payment and stores `bridge_transfer_id` on the ledger row.

## Bootstrap

Ask Bridge for a Developer sandbox key first. Then:

```bash
BRIDGE_API_KEY=… pnpm bridge:bootstrap
```

The script prints `BRIDGE_CUSTOMER_ID`, `BRIDGE_VIRTUAL_ACCOUNT_ID`, `BRIDGE_WEBHOOK_ID`, and the webhook PEM. Put those on the lab service as `BRIDGE_API_KEY`, `BRIDGE_CUSTOMER_ID`, `BRIDGE_VIRTUAL_ACCOUNT_ID`, `BRIDGE_WEBHOOK_ID`, and `BRIDGE_WEBHOOK_PUBLIC_KEY`. Do not commit them.

## One cycle

```bash
pnpm t2:cycle
```

One payout id runs through an XOF sandbox collect, a USD ledger credit, a Bridge transfer id, a 1 USDC testnet payment, an XOF payout instruction, and a three-way reconcile. The JSON on stdout is the record for the tranche form.

## Webhooks

Bridge signs `X-Webhook-Signature` as `t=<ms>,v0=<base64>` with RSA-SHA256 over `SHA256("${t}.${rawBody}")`. The lab rejects a bad, stale, or missing signature before any ledger write. A repeated event id returns 200 and does not change the ledger. A `virtual_account.activity` event is attached to the row that already has the same `bridge_transfer_id`. It does not create a new credit.
