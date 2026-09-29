# Build phases

Coding order after SCF KYC / kickoff. If SDF writes a different milestone list, follow theirs.

| Phase | Where              | What                                                                                                                                                                          |
| ----- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Paperwork          | Hold product code until KYC. Lifted when kickoff or an explicit implement instruction lands.                                                                                  |
| 1     | This repo          | Operator fund/settle/proof path. Hosted SEP-1. Idempotency and reconcile tests.                                                                                               |
| 2     | This repo + Docker | Official Anchor Platform on a public HOME_DOMAIN. SEP-12 via merchant verify. Sandbox last mile.                                                                              |
| 3     | Hosted payouts API | `rail: "stellar"` behind an org allowlist. Test environment first. The lab refuses unsigned mutating demo routes when public (`X-Lab-Key`).                                   |
| 4     | This repo          | Atomic claim before sign/submit (second caller replays or 409). Bridge adapter, RSA webhook receiver + event-id insert-or-reject, signing interface (local / KMS), reconcile. |
| 5     | Operator           | New mainnet `G…` keys. Guarded scripts. No testnet secrets on public.                                                                                                         |

Non-goals stay: no Soroban, no lomi. token, no merchant-held keys, no USDC as a merchant wallet currency.
