import { createHash, verify } from "node:crypto";

const WINDOW_MS = 10 * 60 * 1000;

export interface SignatureParse {
  timestamp: string;
  signature: string;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/** Parse `t=<ms>,v0=<base64>` from X-Webhook-Signature. */
export function parseSignatureHeader(
  header: string,
): SignatureParse | undefined {
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const index = piece.indexOf("=");
    if (index < 1) continue;
    parts[piece.slice(0, index).trim()] = piece.slice(index + 1).trim();
  }
  const timestamp = parts.t;
  const signature = parts.v0;
  if (!timestamp || !signature) return undefined;
  return { timestamp, signature };
}

/**
 * Bridge signs SHA256(`${t}.${rawBody}`) with RSA-SHA256 PKCS1 v1.5.
 * `now` is injectable so tests can freeze time.
 */
export function verifyBridgeSignature(
  rawBody: string,
  header: string,
  publicKeyPem: string,
  now = Date.now(),
): VerifyResult {
  if (!header) return { ok: false, reason: "missing signature" };
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { ok: false, reason: "malformed signature" };
  const timestamp = Number(parsed.timestamp);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "malformed timestamp" };
  }
  if (now - timestamp > WINDOW_MS) {
    return { ok: false, reason: "stale timestamp" };
  }
  if (timestamp - now > WINDOW_MS) {
    return { ok: false, reason: "future timestamp" };
  }
  const digest = createHash("sha256")
    .update(`${parsed.timestamp}.${rawBody}`)
    .digest();
  try {
    const ok = verify(
      "sha256",
      digest,
      publicKeyPem,
      Buffer.from(parsed.signature, "base64"),
    );
    return ok ? { ok: true } : { ok: false, reason: "invalid signature" };
  } catch {
    return { ok: false, reason: "invalid signature" };
  }
}

/** Split concatenated SPKI PEMs for key rotation. */
export function parsePemList(raw: string): string[] {
  const pems: string[] = [];
  const chunks = raw.split(/-----END PUBLIC KEY-----/);
  for (const chunk of chunks) {
    const start = chunk.indexOf("-----BEGIN");
    if (start < 0) continue;
    pems.push(`${chunk.slice(start).trim()}\n-----END PUBLIC KEY-----\n`);
  }
  return pems;
}

export function verifyBridgeSignatureAny(
  rawBody: string,
  header: string,
  publicKeyPems: string[],
  now = Date.now(),
): VerifyResult {
  if (publicKeyPems.length === 0) {
    return { ok: false, reason: "missing public key" };
  }
  let last: VerifyResult = { ok: false, reason: "invalid signature" };
  for (const pem of publicKeyPems) {
    last = verifyBridgeSignature(rawBody, header, pem, now);
    if (last.ok) return last;
  }
  return last;
}
