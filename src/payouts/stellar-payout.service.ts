import { randomUUID } from 'node:crypto';
import { DEFAULT_DEMO_ORGANIZATION_ID, explorerAccount, explorerTx } from '../config.js';
import {
  findByPayoutId,
  type StellarSettlementRecord,
  upsertSettlement,
} from '../ledger/store.js';
import { mockBridgeUsdToUsdc } from '../mock/bridge.js';
import { mockMobileMoneyOfframp } from '../mock/offramp.js';
import { loadKeypair } from '../stellar/keys.js';
import { sendUsdcPayment } from '../stellar/payment.js';
import { writeTestnetProof } from '../testnet-proof.js';
import type {
  CreateStellarPayoutInput,
  CreateStellarPayoutResponse,
} from './types.js';

export interface SettleDemoInput {
  amount?: string;
  payoutId?: string;
  phone?: string;
  organization_id?: string;
  destination?: 'self' | 'beneficiary';
  last_mile_rail?: 'wave' | 'mtn' | 'spi' | 'bank';
  currency_code?: string;
  amount_number?: number;
}

export interface SettleDemoResult {
  payoutId: string;
  amountUsdc: string;
  stellarTxHash: string;
  explorerAccountOmnibus: string;
  explorerAccountMerchant: string;
  explorerTx: string;
  bridgeTransferId: string;
  mockOfframp: ReturnType<typeof mockMobileMoneyOfframp>;
  settlement: StellarSettlementRecord;
  idempotentReplay: boolean;
}

function usdcAmountFromInput(input: SettleDemoInput): string {
  if (input.amount) return input.amount;
  if (input.currency_code === 'USD' && input.amount_number) {
    return String(input.amount_number);
  }
  return '10';
}

function merchantAmount(input: SettleDemoInput): number {
  if (input.amount_number !== undefined) return input.amount_number;
  return Number(usdcAmountFromInput(input));
}

function recordToDemoResult(
  record: StellarSettlementRecord,
  offramp: ReturnType<typeof mockMobileMoneyOfframp>,
  idempotentReplay: boolean,
): SettleDemoResult {
  const hash = record.stellar_tx_hash ?? '';
  return {
    payoutId: record.payout_id,
    amountUsdc: record.amount_usdc,
    stellarTxHash: hash,
    explorerAccountOmnibus: record.stellar_from
      ? explorerAccount(record.stellar_from)
      : '',
    explorerAccountMerchant: record.stellar_to
      ? explorerAccount(record.stellar_to)
      : '',
    explorerTx: hash ? explorerTx(hash) : '',
    bridgeTransferId: record.bridge_transfer_id ?? '',
    mockOfframp: offramp,
    settlement: record,
    idempotentReplay,
  };
}

function buildOfframpFromRecord(
  record: StellarSettlementRecord,
): ReturnType<typeof mockMobileMoneyOfframp> {
  return {
    rail: 'wave',
    amountXof: String(Math.round(Number(record.amount_usdc) * 576)),
    phone: record.mock_offramp?.phone ?? '+2250700000000',
    status: 'credited',
    message: 'Replay from ledger (idempotent).',
    createdAt: record.updated_at,
  };
}

export async function runSettlementDemo(
  input: SettleDemoInput = {},
): Promise<SettleDemoResult> {
  const payoutId = input.payoutId ?? randomUUID();
  const existing = findByPayoutId(payoutId);
  if (
    existing &&
    existing.stellar_tx_hash &&
    (existing.status === 'completed' || existing.status === 'processing')
  ) {
    return recordToDemoResult(
      existing,
      buildOfframpFromRecord(existing),
      true,
    );
  }

  const amountUsdc = usdcAmountFromInput(input);
  const organizationId =
    input.organization_id ?? DEFAULT_DEMO_ORGANIZATION_ID;
  const destination = input.destination ?? 'self';
  const lastMileRail = input.last_mile_rail ?? 'wave';
  const currencyCode = input.currency_code ?? 'USD';
  const now = new Date().toISOString();
  const memo = payoutId.slice(0, 28);

  let record: StellarSettlementRecord = {
    id: existing?.id ?? randomUUID(),
    organization_id: organizationId,
    environment: 'test',
    payout_id: payoutId,
    destination,
    last_mile_rail: lastMileRail,
    amount: merchantAmount(input),
    currency_code: currencyCode,
    amount_usdc: amountUsdc,
    memo,
    status: 'pending',
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  upsertSettlement(record);

  const omnibus = loadKeypair('omnibus');
  const merchant = loadKeypair('merchant');

  const bridge = mockBridgeUsdToUsdc(amountUsdc);
  record = upsertSettlement({
    ...record,
    status: 'processing',
    bridge_transfer_id: bridge.id,
  });

  try {
    const payment = await sendUsdcPayment(
      omnibus,
      merchant.publicKey(),
      amountUsdc,
      payoutId,
    );
    const offramp = mockMobileMoneyOfframp(amountUsdc, input.phone);

    record = upsertSettlement({
      ...record,
      status: 'completed',
      stellar_tx_hash: payment.hash,
      stellar_from: payment.from,
      stellar_to: payment.to,
      memo: payment.memo,
      mock_offramp: {
        rail: offramp.rail,
        phone: offramp.phone,
        status: offramp.status,
      },
    });

    writeTestnetProof({
      omnibusPublicKey: omnibus.publicKey(),
      merchantPublicKey: merchant.publicKey(),
      settlementTx: payment.hash,
    });

    return {
      payoutId,
      amountUsdc,
      stellarTxHash: payment.hash,
      explorerAccountOmnibus: explorerAccount(omnibus.publicKey()),
      explorerAccountMerchant: explorerAccount(merchant.publicKey()),
      explorerTx: explorerTx(payment.hash),
      bridgeTransferId: bridge.id,
      mockOfframp: offramp,
      settlement: record,
      idempotentReplay: false,
    };
  } catch (err) {
    upsertSettlement({
      ...record,
      status: 'failed',
    });
    throw err;
  }
}

export async function createStellarPayout(
  input: CreateStellarPayoutInput,
): Promise<CreateStellarPayoutResponse> {
  const payoutId = input.payout_id ?? randomUUID();
  const amountUsdc =
    input.amount_usdc ??
    (input.currency_code === 'USD'
      ? String(input.amount)
      : String(Math.max(1, Math.round(input.amount / 576))));

  const demo = await runSettlementDemo({
    payoutId,
    amount: amountUsdc,
    amount_number: input.amount,
    currency_code: input.currency_code,
    organization_id: input.organization_id,
    destination: input.destination,
    last_mile_rail: input.last_mile_rail ?? 'wave',
    phone: input.recipient?.phone,
  });

  const kind: 'withdrawal' | 'beneficiary' =
    input.destination === 'beneficiary' ? 'beneficiary' : 'withdrawal';

  return {
    success: demo.settlement.status === 'completed',
    payout_id: demo.payoutId,
    kind,
    status: demo.settlement.status,
    message: demo.idempotentReplay
      ? 'Idempotent replay: existing stellar settlement.'
      : 'Stellar USDC hop completed (testnet demo).',
    stellar_tx_hash: demo.stellarTxHash || undefined,
    explorer_tx: demo.explorerTx || undefined,
    explorer_account_omnibus: demo.explorerAccountOmnibus || undefined,
    explorer_account_merchant: demo.explorerAccountMerchant || undefined,
    bridge_transfer_id: demo.bridgeTransferId || undefined,
    settlement: demo.settlement,
  };
}
