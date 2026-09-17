# SEP-24 sandbox walkthrough

Record this on Freighter or LOBSTR (Testnet). Curl replay is second.

## Wallet clip (you record)

1. Open `https://lab-production-5fac.up.railway.app/.well-known/stellar.toml`. Confirm it lists XOF and USDC, and `SIGNING_KEY` is a G… address.
2. Open `https://anchor-production-5059.up.railway.app/sep24/info`. USDC deposit and withdraw are enabled.
3. Freighter or LOBSTR on **Testnet**. Add home domain `lab-production-5fac.up.railway.app`.
4. Complete SEP-10 against `https://anchor-production-5059.up.railway.app/auth`.
5. SEP-12: a new G… is `NEEDS_INFO` until you submit email on the wallet KYC form (testnet sandbox accept). Then `ACCEPTED`.
6. Start a **USDC** SEP-24 withdraw or deposit. Interactive page: sandbox phone, Wave or MTN, submit.
7. Receipt page shows `status=sandbox` and a transaction id. Open `https://lab-production-5fac.up.railway.app/anchor/sep24/credit/<id>`. No live mobile money.
8. Nest Test hop (already landed): payout `83e4aa27-e619-4d13-963c-9b49ce62a59f` — https://stellar.expert/explorer/testnet/tx/49e2a131c61d7b3e41e0b53b6a22cb98fe98fbf0fdeadfa2b1e4342ccf328ffe

Logs from `pnpm t1:walkthrough` live in gitignored `.scf/t1-logs/`. Do not commit JWT secrets or seeds.

## Replay without a wallet

```bash
pnpm t1:walkthrough
pnpm http:replay -- --base https://lab-production-5fac.up.railway.app
```
