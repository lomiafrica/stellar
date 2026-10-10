# SEP-24 sandbox walkthrough

Two proofs. Do not mix them.

## Wave last mile

Money path on the page runs Wave CFA, then the anchor, then the wallet, and only the Wave hop is written as a sandbox receipt, so do not open StellarExpert from here.

Machine proof: `pnpm test:live` (`test/live/anchor-sep24.test.ts`). It signs SEP-10, PUTs SEP-12, starts SEP-24, posts the lab form, and asserts the platform tx is completed with no Stellar payment.

1. Open `https://lab-production-5fac.up.railway.app/anchor/sep24/flow`. Read cash in vs cash out.
2. Open the interactive form (or let the live test drive it). Last mile = Wave sandbox. Submit.
3. Receipt shows a sandbox Wave hop and says this lab id is not a Stellar transaction.

## USDC payout hop

Different money. Merchant `POST /payouts` with `rail=stellar`. Machine proof: `test/live/payout-roundtrip.test.ts` (1 USDC, Horizon memo check, recycle). Nightly artifact: `live-proof.json`.

10 Oct 2026 payout `5f3fb775-036e-4798-9a15-137428ac76e2`. Explorer https://stellar.expert/explorer/testnet/tx/2fcb2a2610cfbd040e0fa886d38ebf61424bb02c302379f244bc1f3c99d86035

Earlier test payout `83e4aa27-e619-4d13-963c-9b49ce62a59f`. Explorer https://stellar.expert/explorer/testnet/tx/49e2a131c61d7b3e41e0b53b6a22cb98fe98fbf0fdeadfa2b1e4342ccf328ffe

Logs from `pnpm t1:walkthrough` live in gitignored `.scf/t1-logs/`. Do not commit JWT secrets or seeds.

## Replay without a wallet

```bash
pnpm t1:walkthrough
pnpm test:live
pnpm http:replay -- --base https://lab-production-5fac.up.railway.app
```
