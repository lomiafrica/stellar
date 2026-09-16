# Host the lab

The Nest lab serves SEP-1 at `/.well-known/stellar.toml`. Anchor Platform is a second container (`stellar/anchor-platform:4.8.0`) with SEP-10, SEP-12, and SEP-24.

This lab lives on its own Railway project named **Stellar**. Nest hops via `POST {STELLAR_LAB_URL}/demo/payouts` when `STELLAR_LAB_URL` is set on sandbox and live API (Test-only until `STELLAR_RAIL_ALLOW_LIVE=1`).

## Railway (standalone project)

1. Private project **Stellar** in the same workspace as the other products.
2. Service **lab** from `lomiafrica/stellar` (`main`), Dockerfile at repo root.
3. Health check: `/health` (SEP-1 remains `/.well-known/stellar.toml`).
4. Generate a `*.up.railway.app` domain. Do not wait on `stellar.lomi.africa`.
5. Lab env only (no lomi. `SUPABASE_*`, live Stripe, or Wave keys; leave `LOMI_MERCHANT_VERIFY_URL` empty):

```
PORT=3456
PUBLIC_BASE_URL=https://<the-public-host>
ANCHOR_PUBLIC_URL=https://<anchor-host>
PLATFORM_API_URL=http://${{anchor.RAILWAY_PRIVATE_DOMAIN}}:8085
STELLAR_NETWORK=testnet
OMNIBUS_SECRET=S…
MERCHANT_SECRET=S…
SEP10_SIGNING_SEED=S…
SEP10_SIGNING_PUBLIC_KEY=G…
SEP10_JWT_SECRET=
CALLBACK_AUTH_SECRET=
SEP24_INTERACTIVE_URL_JWT_SECRET=
SEP12_ACCEPTED_ACCOUNTS=G…
WEB_AUTH_ENDPOINT=https://<anchor-host>/auth
```

Prefer env secrets so Railway's ephemeral filesystem does not need a volume. Bootstrap keys from env on each deploy.

6. Service **Postgres** (Railway plugin). Anchor 4.8.0 has no SQLite/H2 driver.

7. Service **anchor** from the same repo, `anchor/` as root, `FROM stellar/anchor-platform:4.8.0`. Start: `java -jar /app/anchor-platform-runner.jar --sep-server --platform-server`. `HOME_DOMAIN` = lab host (no scheme), `LAB_BASE_URL` = public lab URL, `SEP10_SIGNING_SEED` from env. Never commit the seed.

```
DATA_TYPE=postgres
DATA_SERVER=${{Postgres.PGHOST}}:${{Postgres.PGPORT}}
DATA_DATABASE=${{Postgres.PGDATABASE}}
DATA_FLYWAY_ENABLED=true
SECRET_DATA_USERNAME=${{Postgres.PGUSER}}
SECRET_DATA_PASSWORD=${{Postgres.PGPASSWORD}}
SEP10_WEB_AUTH_DOMAIN=<anchor public host, no scheme>
SECRET_CALLBACK_API_AUTH_SECRET=<same as lab CALLBACK_AUTH_SECRET>
SECRET_PLATFORM_API_AUTH_SECRET=<same as lab CALLBACK_AUTH_SECRET>
SECRET_SEP24_INTERACTIVE_URL_JWT_SECRET=<same as lab SEP24_INTERACTIVE_URL_JWT_SECRET>
SECRET_SEP24_MORE_INFO_URL_JWT_SECRET=<same as interactive JWT secret>
```

Lab `WEB_AUTH_ENDPOINT=https://<anchor-host>/auth` so SEP-1 points wallets at SEP-10. Toml `TRANSFER_SERVER_SEP0024` / `KYC_SERVER` point at the Anchor host `/sep24` and `/sep12`.

Nest: sandbox `STELLAR_LAB_URL` + `STELLAR_RAIL_ORGANIZATION_IDS=*`. Live Nest: same lab URL, one org UUID, no `STELLAR_RAIL_ALLOW_LIVE`.
