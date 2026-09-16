# Host the lab

The Nest lab serves SEP-1 at `/.well-known/stellar.toml`. Anchor Platform is a second container (`stellar/anchor-platform:4.8.0`).

Isolation: this lab lives on its own Railway project named **Stellar**. Do not attach it to the lomi. Railway canvas. Do not set `STELLAR_LAB_URL` or `STELLAR_RAIL_ORGANIZATION_IDS` on `api.lomi.africa` / `sandbox.api.lomi.africa`. Connecting Nest is a later flag flip.

## Railway (standalone project)

1. Private project **Stellar** in the same workspace as the other products.
2. Service **lab** from `lomiafrica/stellar` (`main`), Dockerfile at repo root.
3. Health check: `/health` (SEP-1 remains `/.well-known/stellar.toml`).
4. Generate a `*.up.railway.app` domain. Do not wait on `stellar.lomi.africa`.
5. Lab env only (no lomi. `SUPABASE_*`, live Stripe, or Wave keys; leave `LOMI_MERCHANT_VERIFY_URL` empty):

```
PORT=3456
PUBLIC_BASE_URL=https://<the-public-host>
STELLAR_NETWORK=testnet
OMNIBUS_SECRET=S…
MERCHANT_SECRET=S…
SEP10_SIGNING_SEED=S…
SEP10_SIGNING_PUBLIC_KEY=G…
SEP10_JWT_SECRET=
CALLBACK_AUTH_SECRET=
SEP12_ACCEPTED_ACCOUNTS=G…
```

Prefer env secrets so Railway's ephemeral filesystem does not need a volume. Bootstrap keys from env on each deploy.

6. Second service **anchor** from the same repo, `anchor/` as root, `FROM stellar/anchor-platform:4.8.0`. Start: `java -jar /app/anchor-platform-runner.jar --sep-server`. `HOME_DOMAIN` = lab host (no scheme), `LAB_BASE_URL` = public lab URL, `SEP10_SIGNING_SEED` from env. Never commit the seed.

Until a later connect, Nest does not call this host. The HTTP contract is still `POST {STELLAR_LAB_URL}/demo/payouts`.
