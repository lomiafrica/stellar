import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { getAppRoot, getKeysDir } from '../paths.js';

export { getAppRoot } from '../paths.js';

const envPath = () => join(getAppRoot(), '.env');

export type KeyRole = 'omnibus' | 'merchant';

export interface StoredKeys {
  omnibus: { publicKey: string; secret: string };
  merchant: { publicKey: string; secret: string };
}

function ensureKeysDir(): string {
  const keysDir = getKeysDir();
  if (!existsSync(keysDir)) {
    mkdirSync(keysDir, { recursive: true });
  }
  return keysDir;
}

export function loadKeypair(role: KeyRole): Keypair {
  const fromEnv =
    role === 'omnibus'
      ? process.env.OMNIBUS_SECRET
      : process.env.MERCHANT_SECRET;
  if (fromEnv?.trim()) {
    return Keypair.fromSecret(fromEnv.trim());
  }

  const path = join(ensureKeysDir(), `${role}.json`);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${role} keys. Run pnpm bootstrap or set ${role === 'omnibus' ? 'OMNIBUS_SECRET' : 'MERCHANT_SECRET'} in .env`,
    );
  }
  // SAFETY: Key files are written by generateAndStoreKeys with this schema.
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    secret: string;
  };
  return Keypair.fromSecret(parsed.secret);
}

export function generateAndStoreKeys(): StoredKeys {
  const keysDir = ensureKeysDir();
  const omnibus = Keypair.random();
  const merchant = Keypair.random();

  const stored: StoredKeys = {
    omnibus: {
      publicKey: omnibus.publicKey(),
      secret: omnibus.secret(),
    },
    merchant: {
      publicKey: merchant.publicKey(),
      secret: merchant.secret(),
    },
  };

  writeFileSync(
    join(keysDir, 'omnibus.json'),
    JSON.stringify(stored.omnibus, null, 2),
  );
  writeFileSync(
    join(keysDir, 'merchant.json'),
    JSON.stringify(stored.merchant, null, 2),
  );

  upsertEnvSecrets(stored);
  return stored;
}

function upsertEnvSecrets(keys: StoredKeys): void {
  const envFile = envPath();
  let content = existsSync(envFile)
    ? readFileSync(envFile, 'utf8')
    : readFileSync(join(getAppRoot(), '.env.example'), 'utf8');

  content = setEnvLine(content, 'OMNIBUS_SECRET', keys.omnibus.secret);
  content = setEnvLine(content, 'MERCHANT_SECRET', keys.merchant.secret);
  writeFileSync(envFile, content);

  process.env.OMNIBUS_SECRET = keys.omnibus.secret;
  process.env.MERCHANT_SECRET = keys.merchant.secret;
}

function setEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  return `${content.trimEnd()}\n${line}\n`;
}

export function readStoredKeys(): StoredKeys | null {
  const keysDir = getKeysDir();
  const omnibusPath = join(keysDir, 'omnibus.json');
  const merchantPath = join(keysDir, 'merchant.json');
  if (!existsSync(omnibusPath) || !existsSync(merchantPath)) {
    return null;
  }
  return {
    // SAFETY: Both key files are written by generateAndStoreKeys.
    omnibus: JSON.parse(readFileSync(omnibusPath, 'utf8')) as StoredKeys['omnibus'],
    // SAFETY: Both key files are written by generateAndStoreKeys.
    merchant: JSON.parse(readFileSync(merchantPath, 'utf8')) as StoredKeys['merchant'],
  };
}

