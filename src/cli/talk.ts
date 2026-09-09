export const CIRCLE_FAUCET_URL = 'https://faucet.circle.com';
export const SETTLE_USDC = 10;

export const LAB_STEPS = [
  { n: 1, cmd: 'bootstrap', what: 'accounts + XLM + USDC trustlines' },
  { n: 2, cmd: 'settle:10', what: 'send 10 USDC  (needs Circle test USDC)' },
  { n: 3, cmd: 'proof', what: 'explorer links + reconcile' },
] as const;

export function printLabHeader(): void {
  console.log('lomi. testnet lab');
  console.log('');
  console.log('Merchants collect XOF on Wave / MTN / cards.');
  console.log('This repo is only the USD hop: Circle USDC on Stellar Testnet.');
  console.log('Omnibus (lomi. treasury) pays a merchant account. Memo = payout id.');
  console.log('Merchants never hold keys. Not wired to live lomi. payouts.');
  console.log('');
}

export function printStepList(current?: 1 | 2 | 3): void {
  for (const step of LAB_STEPS) {
    const mark = current === step.n ? '>' : ' ';
    console.log(
      `${mark} ${step.n}/3  ${step.cmd.padEnd(12)} ${step.what}`,
    );
  }
  console.log('');
}

export function printWhy(line: string): void {
  console.log(`Why: ${line}`);
}

export function printNext(command: string): void {
  console.log(`Next: ${command}`);
}

export function printFaucetHint(omnibusPublicKey: string): void {
  console.log(`Omnibus needs ${SETTLE_USDC} USDC to settle.`);
  console.log(`1. Open ${CIRCLE_FAUCET_URL}`);
  console.log('2. Select Stellar Testnet');
  console.log(`3. Paste  ${omnibusPublicKey}`);
  console.log(`4. Request ${SETTLE_USDC} USDC`);
  console.log('5. Run  pnpm settle:10');
}
