# SEP-24 sandbox walkthrough

Record this once the lab is on a public `HOME_DOMAIN`.

1. Fetch `https://<HOME_DOMAIN>/.well-known/stellar.toml`. Confirm it parses, lists XOF, and `SIGNING_KEY` is a `G…` address (not empty).
2. Open Freighter or LOBSTR on Testnet. Add the home domain.
3. Complete SEP-10 against `WEB_AUTH_ENDPOINT`.
4. SEP-12: an unknown G… account must return `NEEDS_INFO`. An allowlisted merchant account returns `ACCEPTED` (or the merchant verification callback result).
5. Start a SEP-24 deposit or withdraw. Use the interactive page, enter a sandbox phone, pick Wave or MTN, submit.
6. Confirm the JSON response has `last_mile.status = sandbox` and a `payout_id`. No live mobile money.
7. Keep SEP-10/12 logs from the Anchor Platform container and this walkthrough clip.

Replay without a wallet (`pnpm http:replay -- --base "$PUBLIC_BASE_URL"`, or curls):

```bash
curl -sS "$PUBLIC_BASE_URL/.well-known/stellar.toml"
curl -sS -X POST "$PUBLIC_BASE_URL/anchor/sep12/customer" \
  -H "Content-Type: application/json" \
  -d '{"account":"GUNKNOWNACCOUNT00000000000000000000000000000000000000","type":"sep24"}'
curl -sS -X POST "$PUBLIC_BASE_URL/anchor/sep24/withdraw" \
  -H "Content-Type: application/json" \
  -d '{"amount":"1000","phone":"+2250700000000","rail":"wave"}'
QUOTE=$(curl -sS -X POST "$PUBLIC_BASE_URL/anchor/sep38/quote" \
  -H "Content-Type: application/json" \
  -d '{"sell_asset":"iso4217:XOF","buy_asset":"stellar:USDC","sell_amount":"1000","ttl_seconds":0}')
curl -sS "$PUBLIC_BASE_URL/anchor/sep38/quote/$(printf '%s' "$QUOTE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
curl -sS -X POST "$PUBLIC_BASE_URL/anchor/sep6/withdraw" \
  -H "Content-Type: application/json" \
  -d '{"amount":"1000","rail":"wave"}'
curl -sS -X POST "$PUBLIC_BASE_URL/demo/payouts" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: replay-001" \
  -d '{"destination":"self","rail":"stellar","amount":10,"currency_code":"USD","payout_id":"'"$PAYOUT_ID"'"}'
# same payout_id again must return the same stellar_tx_hash
curl -sS -X POST "$PUBLIC_BASE_URL/demo/payouts" \
  -H "Content-Type: application/json" \
  -d '{"destination":"self","rail":"stellar","amount":10,"currency_code":"USD","payout_id":"'"$PAYOUT_ID"'"}'
```
