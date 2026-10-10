import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Keypair, type Transaction } from "@stellar/stellar-sdk";
import { loadKeypair, type KeyRole } from "./keys.js";

/** Signs a built classic transaction. Local keys today; KMS can implement later. */
export interface TransactionSigner {
  publicKey(): string;
  sign(tx: Transaction): Promise<Transaction>;
}

/** Signs with an in-process Stellar SDK Keypair. */
export class LocalKeypairSigner implements TransactionSigner {
  constructor(private readonly keypair: Keypair) {}

  publicKey(): string {
    return this.keypair.publicKey();
  }

  async sign(tx: Transaction): Promise<Transaction> {
    tx.sign(this.keypair);
    return tx;
  }
}

/** Decrypts a sealed Stellar seed. The key-encryption key is not the seed. */
export interface KeyUnsealer {
  unseal(packed: Buffer): Promise<Buffer>;
}

/** AES-256-GCM. Packed bytes are iv (12) + tag (16) + ciphertext. */
export class AesGcmUnsealer implements KeyUnsealer {
  constructor(private readonly kek: Buffer) {
    if (kek.length !== 32) {
      throw new Error("key-encryption key must be 32 bytes");
    }
  }

  async unseal(packed: Buffer): Promise<Buffer> {
    if (packed.length < 29) throw new Error("sealed key is too short");
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const body = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.kek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  }
}

/** Seal a seed for STELLAR_KMS_CIPHERTEXT. The KEK stays out of the seed field. */
export function sealSecret(secret: string, kek: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString("base64");
}

/**
 * Public key is stored in the clear. The seed is unsealed only inside sign,
 * then the buffer is wiped. Hosted lab keeps the local key until
 * STELLAR_KMS_CIPHERTEXT, STELLAR_KMS_PUBLIC_KEY, and STELLAR_KMS_KEK are set.
 */
export class EnvelopeSigner implements TransactionSigner {
  constructor(
    private readonly publicKeyValue: string,
    private readonly packed: string,
    private readonly unsealer: KeyUnsealer,
  ) {}

  publicKey(): string {
    return this.publicKeyValue;
  }

  async sign(tx: Transaction): Promise<Transaction> {
    const raw = await this.unsealer.unseal(Buffer.from(this.packed, "base64"));
    try {
      const keypair = Keypair.fromSecret(raw.toString("utf8"));
      if (keypair.publicKey() !== this.publicKeyValue) {
        throw new Error("sealed key does not match STELLAR_KMS_PUBLIC_KEY");
      }
      tx.sign(keypair);
      return tx;
    } finally {
      raw.fill(0);
    }
  }
}

export function loadSigner(role: KeyRole): TransactionSigner {
  const packed = process.env.STELLAR_KMS_CIPHERTEXT?.trim() ?? "";
  const publicKey = process.env.STELLAR_KMS_PUBLIC_KEY?.trim() ?? "";
  const kekRaw = process.env.STELLAR_KMS_KEK?.trim() ?? "";
  if (packed && publicKey && kekRaw) {
    const kek = Buffer.from(kekRaw, "base64");
    return new EnvelopeSigner(publicKey, packed, new AesGcmUnsealer(kek));
  }
  return new LocalKeypairSigner(loadKeypair(role));
}
