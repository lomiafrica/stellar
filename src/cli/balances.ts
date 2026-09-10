import { STELLAR_USDC_ISSUER } from '../config.js';
import { getHorizonServer } from '../stellar/client.js';

export interface HorizonBalanceLine {
  asset_type: string;
  balance: string;
  asset_code?: string;
  asset_issuer?: string;
}

export interface AccountBalances {
  publicKey: string;
  exists: boolean;
  xlm: number;
  usdc: number;
  hasUsdcTrustline: boolean;
}

export function amountsFromHorizonBalances(
  lines: HorizonBalanceLine[],
): { xlm: number; usdc: number; hasUsdcTrustline: boolean } {
  let xlm = 0;
  let usdc = 0;
  let hasUsdcTrustline = false;
  for (const line of lines) {
    const amount = Number(line.balance);
    if (!Number.isFinite(amount)) continue;
    if (line.asset_type === 'native') {
      xlm = amount;
      continue;
    }
    if (
      line.asset_code === 'USDC' &&
      line.asset_issuer === STELLAR_USDC_ISSUER
    ) {
      usdc = amount;
      hasUsdcTrustline = true;
    }
  }
  return { xlm, usdc, hasUsdcTrustline };
}

function asBalanceLines(raw: readonly object[]): HorizonBalanceLine[] {
  const lines: HorizonBalanceLine[] = [];
  for (const row of raw) {
    if (!('asset_type' in row) || !('balance' in row)) continue;
    const assetType = row.asset_type;
    const balance = row.balance;
    if (typeof assetType !== 'string' || typeof balance !== 'string') continue;
    const line: HorizonBalanceLine = {
      asset_type: assetType,
      balance,
    };
    if (
      'asset_code' in row &&
      typeof row.asset_code === 'string' &&
      'asset_issuer' in row &&
      typeof row.asset_issuer === 'string'
    ) {
      line.asset_code = row.asset_code;
      line.asset_issuer = row.asset_issuer;
    }
    lines.push(line);
  }
  return lines;
}

export async function loadAccountBalances(
  publicKey: string,
): Promise<AccountBalances> {
  const horizon = getHorizonServer();
  try {
    const account = await horizon.loadAccount(publicKey);
    const amounts = amountsFromHorizonBalances(
      asBalanceLines(account.balances),
    );
    return { publicKey, exists: true, ...amounts };
  } catch {
    return {
      publicKey,
      exists: false,
      xlm: 0,
      usdc: 0,
      hasUsdcTrustline: false,
    };
  }
}

export function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 7,
  });
}
