export interface MockOfframpResult {
  rail: 'wave' | 'mtn' | 'spi';
  amountXof: string;
  phone: string;
  status: 'credited';
  message: string;
  createdAt: string;
}

export function mockMobileMoneyOfframp(
  amountUsdc: string,
  phone = '+2250700000000',
): MockOfframpResult {
  const xofApprox = String(Math.round(Number(amountUsdc) * 576));
  return {
    rail: 'wave',
    amountXof: xofApprox,
    phone,
    status: 'credited',
    message: 'Mock Wave credit (testnet demo only, no real mobile money).',
    createdAt: new Date().toISOString(),
  };
}
