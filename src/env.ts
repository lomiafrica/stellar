import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAppRoot } from './paths.js';

export function loadDotEnv(): void {
  const envFile = join(getAppRoot(), '.env');
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();
