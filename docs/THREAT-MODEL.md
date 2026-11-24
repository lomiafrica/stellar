# Threat model and monitoring plan (testnet lab)

Scope: the public lab at `lab-production-5fac.up.railway.app` and the payout
path it demonstrates — Wave/MTN/SPI sandbox last mile, Bridge sandbox treasury,
and a real testnet USDC payment per payout. Nothing here moves real money.
Mainnet is out of scope and stays off until Tranche 3.

## Assets and trust boundaries

| Asset | Where it lives | Who can reach it |
| --- | --- | --- |
| Omnibus testnet secret | Railway env, gitignored `keys/` | The lab process only |
| Bridge sandbox API key | Railway env | The lab process only |
| Lab operator key (`LAB_API_KEY`) | Railway env, operator password manager | Mutating routes only |
| Lab ledger (JSON) | Railway volume `/data` | The lab process |
| Public anchor (SEP-6/24/38) | Public host | Anyone — by design |

## Threats and what answers them

**Stolen omnibus key spends testnet USDC.**
Testnet USDC is valueless, and daily caps (`LAB_MAX_USDC_PER_PAYOUT`,
`LAB_MAX_USDC_PER_DAY`) bound any misuse. Above `LAB_DUAL_CONTROL_USDC` a
payout needs a second approval. The key never leaves the lab: `EnvelopeSigner`
is wired so a sealed seed (`STELLAR_KMS_*`) replaces the plain env key, and the
runbook rotates.

**Forged Bridge webhook credits the ledger.**
Every Bridge event is verified against the RSA-SHA256 signature on
`X-Webhook-Signature` before any ledger write. Unsigned, tampered, or stale
events are rejected. A repeated event id returns 200 and writes nothing
(idempotent on event id).

**Replayed payout request double-spends.**
Claims are atomic: a second caller with the same payout id replays the
completed result or gets HTTP 409 while one is in flight. The k6 suite hammers
this path (3,733 creates on five ids, exactly one chain payment per id).

**Stale reads misreport settlement.**
The daily reconcile checks every payout three ways (ledger, Stellar RPC with
Horizon fallback for RPC retention, Bridge). A break parks the payout in a
review queue until a human closes it with a written reason. Reconcile treats
any RPC status other than SUCCESS/FAILED as unknown and asks Horizon.

**Sandbox receipts mistaken for real money.**
Wave/MTN/SPI legs are sandbox notes, never chain payments, and the pages say
so. Bridge sandbox moves no dollars. The runbook and every filing say exactly
what is not claimed (HMAC, Postgres ledger, live last mile, mainnet).

**Public demo abuse.**
The lab is rate-limited, capped per payout and per day, and holds no mainnet
keys or customer data. The anchor only serves testnet assets.

## Monitoring plan

- **Daily three-way reconcile** (`RECONCILE_CRON_HOURS`, default 24h), also
  triggered by the GitHub Live run and by hand (`POST /ops/reconcile/run`).
- **Review queue** for breaks: `/ops/reconcile/review`, closed only with a
  written note. The T2 evidence links the empty queue.
- **Alerts** to Slack on `ALERT_WEBHOOK_URL` (`bridge.error`, `tx.send_error`);
  without it, the same events are JSON lines on stdout.
- **Daily Live workflow** on GitHub exercises the full path and fails loudly.
- **Runbook** (`docs/OPS.md`): stuck transaction, missed webhook, key rotation.
