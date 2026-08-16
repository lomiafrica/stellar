import { randomUUID } from 'node:crypto';

export interface MockBridgeTransfer {
  id: string;
  usdAmount: string;
  usdcAmount: string;
  stellarNetwork: 'testnet';
  status: 'completed';
  createdAt: string;
}

export function mockBridgeUsdToUsdc(usdAmount: string): MockBridgeTransfer {
  return {
    id: `bridge_mock_${randomUUID().slice(0, 8)}`,
    usdAmount,
    usdcAmount: usdAmount,
    stellarNetwork: 'testnet',
    status: 'completed',
    createdAt: new Date().toISOString(),
  };
}
