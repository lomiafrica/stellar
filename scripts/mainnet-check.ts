import { assertMainnetAllowed, getStellarNetwork } from '../src/config.js';
import { readStoredKeys } from '../src/stellar/keys.js';

function main() {
  console.log('Mainnet hop is a new G… key, not the testnet omnibus.');
  try {
    assertMainnetAllowed();
    console.log(`network=${getStellarNetwork()}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const keys = readStoredKeys();
  if (!keys) {
    console.error('No keys loaded. Create a new mainnet pair offline. Do not copy testnet secrets.');
    process.exit(1);
  }

  const testnetOmnibus = 'GD6PH2FAK5DQFFFALZVAT337R7NDGSPWT4R6UBGA5GYLL7N5U4C4GI7I';
  if (keys.omnibus.publicKey === testnetOmnibus) {
    console.error('Refusing the testnet omnibus on public. Generate a new mainnet account.');
    process.exit(1);
  }

  console.log(`omnibus=${keys.omnibus.publicKey}`);
  console.log('Ready to register this public key with SDF. This script does not send XLM.');
}

main();
