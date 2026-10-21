# Product roadmap

The phone merchants use is lomi. This repository is the Stellar settlement lab under that phone, not a second product. Merchant balances stay in F CFA, euros, and dollars. Circle USDC is treasury. Merchants do not hold keys, and lomi. does not issue a stablecoin.

## Today

A customer pays on the phone with Stripe for cards, Apple Pay, and Google Pay, and with Wave or MTN in Côte d'Ivoire. The merchant sends money on from the same app, to Wave, or to a bank account through Airwallex. Those rails are how lomi. already moves fiat in the eight-country zone, which is why an XOF corridor on Stellar can sit under a product people use rather than under a new wallet.

## This lab

The testnet lab proves the hop before it touches that phone. A public Stellar file lists XOF and Circle testnet USDC. A Wave step on the lab page is a sandbox credit. The Stellar payment is the separate payout walkthrough. A separate USDC payment on testnet carries the payout id in the memo, so the same payout always returns the same transaction. Bridge in this repository is a mock of the dollar to USDC treasury leg.

## Next

Bridge becomes the real treasury hop: dollars in, USDC on Stellar, USDC back out to dollars, without an OTC desk in the middle. The phone does not grow a new home screen for that. The Transfer screen merchants already use for Wave and bank sends shows the Stellar transaction id when the rail is on. Accepting a card or a Wave payment stays as it is.

Airwallex bank payouts keep running on their own. They count toward Stellar volume only when that send actually moves on Stellar.

## Later

Mainnet uses new treasury keys, a real Bridge configuration, and a small set of Côte d'Ivoire merchants behind a flag. An inbound corridor can then deliver into mobile money or a bank account in the zone. The phone is still the place a merchant accepts and sends. It is not a place a person holds USDC.
