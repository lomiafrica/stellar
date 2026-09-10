# Build phases

Coding order after SCF KYC / kickoff. If SDF writes a different milestone list, follow theirs.

| Phase | Where | What |
| --- | --- | --- |
| 0 | Paperwork | Hold product code until KYC. Lifted when kickoff or an explicit implement instruction lands. |
| 1 | This repo | Operator fund/settle/proof path. Hosted SEP-1. Idempotency and reconcile tests. |
| 2 | This repo + Docker | Official Anchor Platform on testnet. Last-mile adapters only. No hand-rolled SEP servers. |
| 3 | Private `apps/api` | `rail: stellar` behind an org allowlist. Test environment first. `stellar_settlements` table. |
| 4 | Private `apps/api` | Real Bridge HMAC webhooks. Signing interface (local / KMS). Three-way reconcile. |
| 5 | Operator | New mainnet `G…` keys. Guarded scripts. No testnet secrets on public. |

Non-goals stay: no Soroban, no lomi. token, no merchant-held keys, no USDC on merchant `accounts`.
