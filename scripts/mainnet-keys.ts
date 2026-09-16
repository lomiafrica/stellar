import { Keypair } from "@stellar/stellar-sdk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertMainnetAllowed, getStellarNetwork } from "../src/config.js";
import { getKeysDir } from "../src/paths.js";

/**
 * New mainnet G… keys. Never reuse testnet secrets.
 * Writes gitignored files under keys/mainnet/. Prints public keys only.
 */
function main(): void {
  process.env.STELLAR_NETWORK = process.env.STELLAR_NETWORK ?? "public";
  getStellarNetwork();
  assertMainnetAllowed();

  const dir = join(getKeysDir(), "mainnet");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const omnibus = Keypair.random();
  const sep10 = Keypair.random();
  writeFileSync(
    join(dir, "omnibus.json"),
    `${JSON.stringify({ publicKey: omnibus.publicKey(), secret: omnibus.secret() }, null, 2)}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(dir, "sep10.json"),
    `${JSON.stringify({ publicKey: sep10.publicKey(), secret: sep10.secret() }, null, 2)}\n`,
    { mode: 0o600 },
  );

  process.stdout.write(
    `omnibus ${omnibus.publicKey()}\nsep10 ${sep10.publicKey()}\nWrote secrets under keys/mainnet/ (gitignored).\n`,
  );
}

main();
