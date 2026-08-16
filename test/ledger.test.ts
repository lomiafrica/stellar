import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  findByPayoutId,
  patchSettlement,
  readLedger,
  upsertSettlement,
  type StellarSettlementRecord,
} from '../src/ledger/store.js';
import {
  getIdempotentResponse,
  saveIdempotentResponse,
} from '../src/ledger/idempotency.js';
import type { CreateStellarPayoutResponse } from '../src/payouts/types.js';

function isolateDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stellar-ledger-'));
  process.env.STELLAR_DATA_DIR = dir;
  return dir;
}

function sampleRow(
  patch: Partial<StellarSettlementRecord> = {},
): StellarSettlementRecord {
  const payoutId = patch.payout_id ?? 'payout-aaaaaaaaaaaaaaaaaaaaaaaaaa';
  const now = '2026-08-16T00:00:00.000Z';
  return {
    id: patch.id ?? 'row-1',
    organization_id:
      patch.organization_id ?? '00000000-0000-4000-8000-000000000001',
    environment: patch.environment ?? 'test',
    payout_id: payoutId,
    destination: patch.destination ?? 'self',
    last_mile_rail: patch.last_mile_rail ?? 'wave',
    amount: patch.amount ?? 10,
    currency_code: patch.currency_code ?? 'USD',
    amount_usdc: patch.amount_usdc ?? '10',
    memo: patch.memo ?? payoutId.slice(0, 28),
    status: patch.status ?? 'pending',
    created_at: patch.created_at ?? now,
    updated_at: patch.updated_at ?? now,
    ...patch,
  };
}

test('upsertSettlement writes and finds by payout id', () => {
  isolateDataDir();
  const row = sampleRow();
  upsertSettlement(row);
  const found = findByPayoutId(row.payout_id);
  assert.equal(found?.amount_usdc, '10');
  assert.equal(found?.memo, row.payout_id.slice(0, 28));
});

test('patchSettlement updates status without changing payout id', () => {
  isolateDataDir();
  const row = sampleRow({ payout_id: 'payout-patch-id-0000000000000' });
  upsertSettlement(row);
  const patched = patchSettlement(row.payout_id, {
    status: 'completed',
    stellar_tx_hash: 'abc123',
  });
  assert.equal(patched?.status, 'completed');
  assert.equal(patched?.payout_id, row.payout_id);
  assert.equal(patched?.stellar_tx_hash, 'abc123');
});

test('readLedger normalizes legacy camelCase rows', () => {
  const dir = isolateDataDir();
  writeFileSync(
    join(dir, 'settlements.json'),
    JSON.stringify([
      {
        id: 'legacy-1',
        payoutId: 'legacy-payout-id-00000000000000',
        amountUsdc: 10,
        stellarTxHash: 'hash-legacy',
        status: 'confirmed',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ]),
  );
  const rows = readLedger();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.payout_id, 'legacy-payout-id-00000000000000');
  assert.equal(rows[0]?.status, 'completed');
  assert.equal(rows[0]?.stellar_tx_hash, 'hash-legacy');
});

test('idempotency cache returns the saved payout response', () => {
  isolateDataDir();
  const response: CreateStellarPayoutResponse = {
    success: true,
    payout_id: 'payout-idem-1',
    kind: 'withdrawal',
    status: 'completed',
  };
  saveIdempotentResponse('key-1', response.payout_id, response);
  const cached = getIdempotentResponse('key-1');
  assert.equal(cached?.payout_id, 'payout-idem-1');
  assert.equal(cached?.success, true);
  assert.equal(getIdempotentResponse('missing'), undefined);
});
