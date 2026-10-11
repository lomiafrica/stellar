# Mainnet path

This file is the later flip. None of it has been done. The lab still serves `public/stellar.toml` on the test network. `lomi.africa/.well-known/stellar.toml` proxies that file. `STELLAR_RAIL_ALLOW_LIVE` stays unset. `pnpm mainnet:check` prints this list and does not write keys.

`public/stellar.mainnet.toml` and `anchor/config/anchor-config.mainnet.yaml` are in the repo and are not selected. The Docker image still sets `STELLAR_ANCHOR_CONFIG=/config/anchor-config.yaml`.

## Order

1. New accounts only. `STELLAR_NETWORK=public STELLAR_MAINNET_CONFIRM=YES pnpm mainnet:keys`. Never reuse the testnet omnibus `GD6PH2FAK5DQFFFALZVAT337R7NDGSPWT4R6UBGA5GYLL7N5U4C4GI7I` or the testnet seed.
2. Open a Circle mainnet USDC trustline (`GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`) on those new accounts. Put the new public key in `anchor/config/assets.mainnet.yaml` in place of `REPLACE_WITH_NEW_MAINNET_G`.
3. Seal the seed with `EnvelopeSigner` (`STELLAR_KMS_CIPHERTEXT`, `STELLAR_KMS_PUBLIC_KEY`, `STELLAR_KMS_KEK`). Add two extra signers and set a treasury multisig before any merchant payment. Amounts above `LAB_DUAL_CONTROL_USDC` already need a second approval.
4. Bridge production for the USD to USDC leg. Until that exists, the lab keeps the mock adapter when `BRIDGE_API_KEY` is unset.
5. Publish `public/stellar.mainnet.toml` only after the new public key is in it. Point the anchor at `anchor/config/anchor-config.mainnet.yaml`. SEP-31 receive stays `src/anchor/sep31.ts` until that deploy.
6. Set `STELLAR_RAIL_ORGANIZATION_IDS` to 8 to 10 organizations. Only then change `initiate_stellar_payout` so a live environment can pass. One internal hop between treasury accounts comes before any merchant.

`pnpm mainnet:keys` still refuses to run unless both `STELLAR_NETWORK=public` and `STELLAR_MAINNET_CONFIRM=YES` are set.
