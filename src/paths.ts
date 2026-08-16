import { join } from 'node:path';

export function getAppRoot(): string {
  return process.env.STELLAR_APP_ROOT ?? process.cwd();
}

export function getDataDir(): string {
  return process.env.STELLAR_DATA_DIR ?? join(getAppRoot(), 'data');
}

export function getKeysDir(): string {
  return process.env.STELLAR_KEYS_DIR ?? join(getAppRoot(), 'keys');
}
