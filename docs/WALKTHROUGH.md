# SEP-24 sandbox walkthrough

Two proofs. Do not mix them in one clip.

## Wave last mile (this clip)

Money path on the page: Wave CFA, then Anchor, then the wallet. Only the Wave hop runs. It writes a sandbox receipt. It does not create a Stellar payment. Do not open StellarExpert here.

1. Open `https://lab-production-5fac.up.railway.app/anchor/sep24/flow`. Read cash in vs cash out.
2. Open the interactive form (Freighter, or lab `/anchor/sep24/interactive`). Last mile = Wave sandbox. Submit.
3. Receipt shows a sandbox Wave hop and says this lab id is not a Stellar transaction.
4. Optional: `https://lab-production-5fac.up.railway.app/anchor/sep24/credit/<id>` in a browser (same receipt).

Freighter/LOBSTR on Testnet still needs home domain `lab-production-5fac.up.railway.app` for a wallet-signed SEP-10. Toml and `/sep24/info` stay protocol pages, not the human story.

## Nest USDC hop (separate clip)

Different money. Merchant `POST /payouts` `rail=stellar`. Payout `83e4aa27-e619-4d13-963c-9b49ce62a59f`. Explorer https://stellar.expert/explorer/testnet/tx/49e2a131c61d7b3e41e0b53b6a22cb98fe98fbf0fdeadfa2b1e4342ccf328ffe

Logs from `pnpm t1:walkthrough` live in gitignored `.scf/t1-logs/`. Do not commit JWT secrets or seeds.

## Replay without a wallet

```bash
pnpm t1:walkthrough
pnpm http:replay -- --base https://lab-production-5fac.up.railway.app
```
