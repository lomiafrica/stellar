import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { evaluateReconcile } from '../src/ledger/reconcile.js';
import { upsertSettlement, type StellarSettlementRecord } from '../src/ledger/store.js';
import { stellarMemoFromPayoutId } from '../src/stellar/memo.js';

function isolateDataDir(): void {
  process.env.STELLAR_DATA_DIR = mkdtempSync(join(tmpdir(), 'stellar-recon-'));
}

function row(patch: Partial<StellarSettlementRecord> = {}): StellarSettlementRecord {
  const payoutId = patch.payout_id ?? 'payout-recon-aaaaaaaaaaaaaaaaaa';
  const now = '2026-09-10T00:00:00.000Z';
  return {
    id: 'row-1',
    organization_id: '00000000-0000-4000-8000-000000000001',
    environment: 'test',
    payout_id: payoutId,
    destination: 'self',
    last_mile_rail: 'wave',
    amount: 10,
    currency_code: 'USD',
    amount_usdc: '10',
    memo: stellarMemoFromPayoutId(payoutId),
    status: 'completed',
    stellar_tx_hash: 'hash-ok',
    created_at: now,
    updated_at: now,
    ...patch,
  };
}

test('evaluateReconcile ok when hash memo and ledger match', () => {
  isolateDataDir();
  const ledgerRow = row();
  const result = evaluateReconcile({
    hash: 'hash-ok',
    ledgerRow,
    onChainSuccess: true,
    onChainMemo: ledgerRow.memo,
  });
  assert.equal(result.ok, true);
  assert.equal(result.memoMatch, true);
  assert.equal(result.ledgerFound, true);
});

test('evaluateReconcile fails when on-chain memo does not match payout id', () => {
  isolateDataDir();
  const ledgerRow = row();
  const result = evaluateReconcile({
    hash: 'hash-ok',
    ledgerRow,
    onChainSuccess: true,
    onChainMemo: 'wrong-memo',
  });
  assert.equal(result.ok, false);
  assert.equal(result.memoMatch, false);
});

test('evaluateReconcile fails when ledger hash does not match', () => {
  isolateDataDir();
  const result = evaluateReconcile({
    hash: 'other-hash',
    ledgerRow: row(),
    onChainSuccess: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ledgerFound, true);
});

test('evaluateReconcile fails when ledger row is missing', () => {
  isolateDataDir();
  const result = evaluateReconcile({
    hash: 'hash-ok',
    onChainSuccess: true,
    onChainMemo: 'payout-recon-aaaaaaaaaaaaaaaaaa'.slice(0, 28),
  });
  assert.equal(result.ok, false);
  assert.equal(result.ledgerFound, false);
});

test('same payout_id replays the completed ledger row', async () => {
  isolateDataDir();
  const payoutId = 'payout-idempotent-replay-0000001';
  upsertSettlement(
    row({
      payout_id: payoutId,
      memo: stellarMemoFromPayoutId(payoutId),
      stellar_tx_hash: 'hash-replay',
      status: 'completed',
    }),
  );
  const { runSettlementDemo } = await import('../src/settlement-demo.js');
  const first = await runSettlementDemo({ payoutId, amount: '10' });
  const second = await runSettlementDemo({ payoutId, amount: '10' });
  assert.equal(first.idempotentReplay, true);
  assert.equal(second.idempotentReplay, true);
  assert.equal(first.stellarTxHash, 'hash-replay');
  assert.equal(second.stellarTxHash, 'hash-replay');
});
