# Anchor Platform (testnet)

Use the official SDF image. This repo hosts SEP-1, merchant SEP-12 callbacks, SEP-24 sandbox pages, SEP-6/38, and last-mile adapters. SEP-10 signing stays in the platform container.

```bash
pnpm sep10:key   # print SEP10_SIGNING_PUBLIC_KEY + SEP10_SIGNING_SEED; do not commit
# put the seed in .env, then:
docker compose -f anchor/docker-compose.yml up
```

Hosted (Railway or equivalent): set `PUBLIC_BASE_URL` and `HOME_DOMAIN` to the public HTTPS origin. Wallets fetch:

`https://<HOME_DOMAIN>/.well-known/stellar.toml`

`WEB_AUTH_ENDPOINT` is the Anchor host `/auth` (SEP-10), not the lab `/anchor/sep10` stub.

Local:

- SEP-1: `http://localhost:3456/.well-known/stellar.toml`
- Platform: `http://localhost:8080` (SEP-10 `GET/POST /auth`)
- Last mile: `POST http://localhost:3456/anchor/last-mile/wave`

SEP-12 calls `LOMI_MERCHANT_VERIFY_URL` when set. Otherwise it only ACCEPTs `SEP12_ACCEPTED_ACCOUNTS`. Unknown accounts return `NEEDS_INFO`. SEP-24 pages credit Wave / MTN / SPI **sandbox** only. No live Wave money.

Walkthrough: [WALKTHROUGH.md](./WALKTHROUGH.md). Hosting: [HOSTING.md](./HOSTING.md).
