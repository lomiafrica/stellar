import { runSettlementDemo } from '../src/settlement-demo.js';

async function main() {
  console.log('Sending mock $10 USDC settlement on Stellar testnet...\n');
  const result = await runSettlementDemo({ amount: '10' });

  console.log('Payout ID:', result.payoutId);
  console.log('Amount USDC:', result.amountUsdc);
  console.log('Stellar tx:', result.stellarTxHash);
  console.log('Explorer tx:', result.explorerTx);
  console.log('Omnibus account:', result.explorerAccountOmnibus);
  console.log('Merchant account:', result.explorerAccountMerchant);
  console.log('Mock Bridge transfer:', result.bridgeTransferId);
  console.log('Mock off-ramp:', result.mockOfframp.message);
  console.log('\nRun pnpm proof to print explorer links.');
}

main().catch((err) => {
  console.error(err);
  if (String(err).includes('payment failed') || String(err).includes('op_underfunded')) {
    console.error(
      '\nOmnibus likely has no test USDC. Run bootstrap, then fund via https://faucet.circle.com (Stellar Testnet).',
    );
  }
  process.exit(1);
});
