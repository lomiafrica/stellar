# Anchor Platform (testnet)

Use the official SDF image. This repo hosts SEP-1, merchant SEP-12 callbacks, SEP-24 sandbox pages, SEP-6/38, and last-mile adapters. SEP-10 signing stays in the platform container. SEP-12 and SEP-24 for wallets go through the platform (`/sep12`, `/sep24`); the lab implements the Callback API at `/anchor/customer` and JWT interactive pages at `/anchor/sep24/interactive`.

```bash
pnpm sep10:key   # print SEP10_SIGNING_PUBLIC_KEY + SEP10_SIGNING_SEED; do not commit
# put the seed in .env, then:
docker compose -f anchor/docker-compose.yml up
```

Hosted (Railway or equivalent): set `PUBLIC_BASE_URL` and `HOME_DOMAIN` to the public HTTPS origin. Wallets fetch:

`https://<HOME_DOMAIN>/.well-known/stellar.toml`

`WEB_AUTH_ENDPOINT` is the Anchor host `/auth` (SEP-10), not the lab `/anchor/sep10` stub. `TRANSFER_SERVER_SEP0024` and `KYC_SERVER` are the Anchor host `/sep24` and `/sep12`.

Local:

- SEP-1: `http://localhost:3456/.well-known/stellar.toml`
- Platform: `http://localhost:8080` (SEP-10 `GET/POST /auth`, SEP-12, SEP-24)
- Platform API: `http://localhost:8085`
- Callback: `GET/PUT http://localhost:3456/anchor/customer`
- Last mile: `POST http://localhost:3456/anchor/last-mile/wave`

SEP-12 calls `LOMI_MERCHANT_VERIFY_URL` when set. Otherwise it only ACCEPTs `SEP12_ACCEPTED_ACCOUNTS`. Unknown accounts return `NEEDS_INFO`. SEP-24 pages require the platform JWT (`token`) when `SEP24_INTERACTIVE_URL_JWT_SECRET` is set, then PATCH the platform transaction after Wave / MTN / SPI **sandbox** last mile. No live Wave money.

Walkthrough: [WALKTHROUGH.md](./WALKTHROUGH.md). Hosting: [HOSTING.md](./HOSTING.md).
