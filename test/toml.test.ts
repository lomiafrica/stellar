import assert from 'node:assert/strict';
import test from 'node:test';
import { renderStellarToml } from '../src/http/stellar-toml.js';

const TEMPLATE = `NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
ACCOUNTS=[]
TRANSFER_SERVER="{{PUBLIC_BASE_URL}}/anchor"
issuer = "GPLACEHOLDER"
DOCUMENTATION="https://github.com/lomiafrica/stellar/blob/main/docs/ARCHITECTURE.md"
`;

test('renderStellarToml substitutes base URL and accounts', () => {
  const body = renderStellarToml(TEMPLATE, {
    omnibusPublicKey: 'GOMNI',
    merchantPublicKey: 'GMERCH',
    publicBaseUrl: 'https://stellar.example.test/',
  });
  assert.match(body, /TRANSFER_SERVER="https:\/\/stellar.example.test\/anchor"/);
  assert.match(body, /issuer = "GOMNI"/);
  assert.match(body, /ACCOUNTS=\["GOMNI", "GMERCH"\]/);
});
