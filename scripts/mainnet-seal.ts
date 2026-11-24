import { createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import { pathToFileURL } from "node:url";
import "../src/env.js";
import { getKeysDir } from "../src/paths.js";
import { sealSecret } from "../src/stellar/signer.js";
import { assertNotTestnetOmnibus } from "./mainnet-check.js";

export interface SealedMainnetKey {
  publicKey: string;
  ciphertext: string;
  kek: string;
}

/** Synchronous twin of AesGcmUnsealer for this one-shot ceremony check. */
function unsealSync(packed: string, kek: Buffer): Buffer {
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const body = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", kek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/**
 * The key ceremony from docs/MAINNET.md step 3: read keys/mainnet/omnibus.json,
 * seal the seed under a fresh 32-byte key-encryption key, and hand back the
 * three EnvelopeSigner env values. The seed itself is never printed.
 */
export function sealStoredMainnetKey(keysDir: string): SealedMainnetKey {
  const path = join(keysDir, "mainnet", "omnibus.json");
  if (!existsSync(path)) {
    throw new Error(
      "No keys/mainnet/omnibus.json. Run STELLAR_NETWORK=public STELLAR_MAINNET_CONFIRM=YES pnpm mainnet:keys first.",
    );
  }
  // SAFETY: keys/mainnet/omnibus.json is written by scripts/mainnet-keys.ts.
  const stored = JSON.parse(readFileSync(path, "utf8")) as {
    publicKey: string;
    secret: string;
  };
  assertNotTestnetOmnibus(stored.publicKey);
  const source = Keypair.fromSecret(stored.secret);
  if (source.publicKey() !== stored.publicKey) {
    throw new Error(
      "keys/mainnet/omnibus.json publicKey does not match its seed",
    );
  }

  const kek = randomBytes(32);
  const ciphertext = sealSecret(stored.secret, kek);

  // Fail loudly here, not on first sign: the packed value must unseal back to
  // the same public key before anything is printed for the operator.
  const roundTrip = Keypair.fromSecret(
    unsealSync(ciphertext, kek).toString("utf8"),
  );
  if (roundTrip.publicKey() !== stored.publicKey) {
    throw new Error("sealed key does not round-trip; refusing to print it");
  }

  return {
    publicKey: stored.publicKey,
    ciphertext,
    kek: kek.toString("base64"),
  };
}

function main(): void {
  if (process.env.STELLAR_MAINNET_CONFIRM !== "YES") {
    console.error(
      "Refusing without STELLAR_MAINNET_CONFIRM=YES. This seals the mainnet seed.",
    );
    process.exit(1);
  }
  const sealed = sealStoredMainnetKey(getKeysDir());
  console.log(`STELLAR_KMS_PUBLIC_KEY=${sealed.publicKey}`);
  console.log(`STELLAR_KMS_CIPHERTEXT=${sealed.ciphertext}`);
  console.log(`STELLAR_KMS_KEK=${sealed.kek}`);
  console.log(
    [
      "",
      "1. KEK goes to the password manager, nowhere else.",
      "2. PUBLIC_KEY and CIPHERTEXT go to the Railway env with the KEK.",
      "3. Then shred keys/mainnet/omnibus.json. The sealed copy is the only one that stays.",
      "4. pnpm mainnet:check verifies the envelope round-trips.",
    ].join("\n"),
  );
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main();
}
