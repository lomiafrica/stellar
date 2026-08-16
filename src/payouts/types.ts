import type { JsonObject } from '../json.js';
import type {
  PayoutStatus,
  StellarSettlementRecord,
} from '../ledger/store.js';

export const DEFAULT_DEMO_ORGANIZATION_ID =
  process.env.DEMO_ORGANIZATION_ID ??
  '00000000-0000-4000-8000-000000000001';

export type CreateStellarPayoutInput = {
  destination: 'self' | 'beneficiary';
  rail: 'stellar';
  amount: number;
  currency_code: string;
  payout_id?: string;
  organization_id?: string;
  last_mile_rail?: 'wave' | 'mtn' | 'spi' | 'bank';
  payout_method_id?: string;
  recipient?: { name: string; phone: string };
  reason?: string;
  metadata?: JsonObject;
  /** USDC hop size; defaults from amount when currency is USD */
  amount_usdc?: string;
  phone?: string;
};

export type CreateStellarPayoutResponse = {
  success: boolean;
  payout_id: string;
  kind: 'withdrawal' | 'beneficiary';
  status: PayoutStatus;
  message?: string;
  stellar_tx_hash?: string;
  explorer_tx?: string;
  explorer_account_omnibus?: string;
  explorer_account_merchant?: string;
  bridge_transfer_id?: string;
  settlement?: StellarSettlementRecord;
};
