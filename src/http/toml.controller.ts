import { Controller, Get, Header } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAppRoot } from '../paths.js';
import { readStoredKeys } from '../stellar/keys.js';
import { readTestnetProof } from '../testnet-proof.js';

@Controller()
export class TomlController {
  @Get('.well-known/stellar.toml')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  getToml(): string {
    const root = getAppRoot();
    const template = readFileSync(
      join(root, 'public', 'stellar.toml'),
      'utf8',
    );
    const keys = readStoredKeys();
    const proof = readTestnetProof();
    const issuer =
      keys?.omnibus.publicKey ??
      proof?.omnibusPublicKey ??
      'REPLACE_WITH_OMNIBUS_PUBLIC_KEY';
    let body = template.replace(
      'REPLACE_WITH_OMNIBUS_PUBLIC_KEY',
      issuer,
    );
    if (!body.includes('DOCUMENTATION')) {
      body += `\nDOCUMENTATION="https://github.com/lomiafrica/stellar/blob/main/docs/ARCHITECTURE.md"\n`;
    }
    return body;
  }
}
