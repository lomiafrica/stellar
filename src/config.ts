import { Networks } from '@stellar/stellar-sdk';

export const STELLAR_RPC_URL =
  process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';
export const STELLAR_HORIZON_URL =
  process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
export const STELLAR_USDC_ISSUER =
  process.env.STELLAR_USDC_ISSUER ??
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ?? 'http://localhost:3456';
export const PORT = Number(process.env.PORT ?? 3456);

export const DEFAULT_DEMO_ORGANIZATION_ID =
  process.env.DEMO_ORGANIZATION_ID ??
  '00000000-0000-4000-8000-000000000001';

export const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet';

export function explorerAccount(publicKey: string): string {
  return `${EXPLORER_BASE}/account/${publicKey}`;
}

export function explorerTx(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`;
}
