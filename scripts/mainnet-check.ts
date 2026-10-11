import { pathToFileURL } from "node:url";
import {
  assertDeployNetwork,
  assertMainnetAllowed,
  getStellarNetwork,
} from "../src/config.js";
import { TESTNET_OMNIBUS_PUBLIC_KEY } from "../src/http/stellar-toml.js";
import { readStoredKeys } from "../src/stellar/keys.js";

/** Printed by `pnpm mainnet:check`. This command does not write keys. */
export function mainnetFlipChecklist(): string[] {
  return [
    "This build does not create mainnet keys.",
    "STELLAR_RAIL_ALLOW_LIVE stays unset.",
    "1. New G accounts only: STELLAR_NETWORK=public STELLAR_MAINNET_CONFIRM=YES pnpm mainnet:keys",
    "2. Circle mainnet USDC trustline on those new accounts. Never the testnet issuer.",
    "3. Seal the seed with EnvelopeSigner. Two extra signers for treasury multisig.",
    "4. Bridge production, then the unpublished mainnet toml and anchor-config.mainnet.yaml.",
    "5. STELLAR_RAIL_ORGANIZATION_IDS for 8 to 10 organizations, then the SQL live branch.",
    "6. One internal hop, then merchants.",
  ];
}

export function assertNotTestnetOmnibus(publicKey: string): void {
  if (publicKey === TESTNET_OMNIBUS_PUBLIC_KEY) {
    throw new Error(
      "Refusing the testnet omnibus on public. Generate a new mainnet account.",
    );
  }
}

function main(): void {
  for (const line of mainnetFlipChecklist()) {
    console.log(line);
  }
  try {
    assertMainnetAllowed();
    assertDeployNetwork();
    console.log(`network=${getStellarNetwork()}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const keys = readStoredKeys();
  if (!keys) {
    console.error(
      "No keys loaded. Create a new mainnet pair offline. Do not copy testnet secrets.",
    );
    process.exit(1);
  }

  try {
    assertNotTestnetOmnibus(keys.omnibus.publicKey);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log(`omnibus=${keys.omnibus.publicKey}`);
  console.log(
    "Ready to register this public key with SDF. This script does not send XLM.",
  );
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main();
}
