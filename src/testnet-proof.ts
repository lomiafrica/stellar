import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDataDir } from './paths.js';

export interface TestnetProofFile {
  omnibusPublicKey: string;
  merchantPublicKey: string;
  createMerchantTx?: string;
  omnibusTrustlineTx?: string;
  merchantTrustlineTx?: string;
  settlementTx?: string;
  updatedAt: string;
}

const PROOF_PATH = () => join(getDataDir(), 'testnet-proof.json');

export function readTestnetProof(): TestnetProofFile | null {
  try {
    const raw = readFileSync(PROOF_PATH(), 'utf8');
    // SAFETY: This private proof file is written by writeTestnetProof below.
    return JSON.parse(raw) as TestnetProofFile;
  } catch {
    return null;
  }
}

export function writeTestnetProof(
  patch: Partial<TestnetProofFile> & {
    omnibusPublicKey: string;
    merchantPublicKey: string;
  },
): TestnetProofFile {
  const prev = readTestnetProof();
  const sameAccounts =
    prev?.omnibusPublicKey === patch.omnibusPublicKey &&
    prev?.merchantPublicKey === patch.merchantPublicKey;
  const next: TestnetProofFile = {
    omnibusPublicKey: patch.omnibusPublicKey,
    merchantPublicKey: patch.merchantPublicKey,
    createMerchantTx:
      patch.createMerchantTx ?? (sameAccounts ? prev?.createMerchantTx : undefined),
    omnibusTrustlineTx:
      patch.omnibusTrustlineTx ??
      (sameAccounts ? prev?.omnibusTrustlineTx : undefined),
    merchantTrustlineTx:
      patch.merchantTrustlineTx ??
      (sameAccounts ? prev?.merchantTrustlineTx : undefined),
    settlementTx:
      patch.settlementTx ?? (sameAccounts ? prev?.settlementTx : undefined),
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(getDataDir(), { recursive: true });
  writeFileSync(PROOF_PATH(), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
