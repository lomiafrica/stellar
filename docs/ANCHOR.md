# Anchor Platform (testnet)

Use the official SDF image. This repo only hosts SEP-1 and last-mile callbacks.

```bash
docker compose -f anchor/docker-compose.yml up
```

Then:

- SEP-1: `http://localhost:3456/.well-known/stellar.toml`
- Platform: `http://localhost:8080`
- Last mile: `POST http://localhost:3456/anchor/last-mile/wave`

SEP-12 here is a stub that says ACCEPTED. Production must reuse existing merchant verification. SEP-24 pages are sandbox HTML. No live Wave / MTN / SPI money.

Set `PUBLIC_BASE_URL` to the hosted lab URL so wallets can fetch the toml (CORS is open).
