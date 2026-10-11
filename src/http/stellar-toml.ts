import { Keypair } from "@stellar/stellar-sdk";
import { PUBLIC_BASE_URL } from "../config.js";

/** Testnet omnibus. It must never appear in the unpublished mainnet toml. */
export const TESTNET_OMNIBUS_PUBLIC_KEY =
  "GD6PH2FAK5DQFFFALZVAT337R7NDGSPWT4R6UBGA5GYLL7N5U4C4GI7I";

export function isMainnetTomlTemplate(template: string): boolean {
  return template.includes("Public Global Stellar Network");
}

/** Throws when a mainnet template would be filled with the testnet omnibus. */
export function assertMainnetTomlOmnibus(
  template: string,
  omnibusPublicKey?: string,
): void {
  if (!isMainnetTomlTemplate(template)) return;
  const bakedIn = template.includes(TESTNET_OMNIBUS_PUBLIC_KEY);
  const passedIn = omnibusPublicKey === TESTNET_OMNIBUS_PUBLIC_KEY;
  if (bakedIn || passedIn) {
    throw new Error("Refusing the testnet omnibus in the mainnet toml.");
  }
}

function signingPublicKey(input?: {
  sep10SigningSeed?: string;
  sep10SigningPublicKey?: string;
}): string {
  const fromEnv =
    input?.sep10SigningPublicKey ??
    process.env.SEP10_SIGNING_PUBLIC_KEY?.trim() ??
    "";
  if (fromEnv.startsWith("G")) return fromEnv;
  const seed =
    input?.sep10SigningSeed ?? process.env.SEP10_SIGNING_SEED?.trim() ?? "";
  if (seed.startsWith("S")) {
    return Keypair.fromSecret(seed).publicKey();
  }
  return "";
}

export function renderStellarToml(
  template: string,
  input: {
    omnibusPublicKey?: string;
    merchantPublicKey?: string;
    publicBaseUrl?: string;
    webAuthEndpoint?: string;
    anchorPublicUrl?: string;
    sep10SigningSeed?: string;
    sep10SigningPublicKey?: string;
  },
): string {
  assertMainnetTomlOmnibus(template, input.omnibusPublicKey);
  const base = (input.publicBaseUrl ?? PUBLIC_BASE_URL).replace(/\/$/, "");
  const signingKey = signingPublicKey(input);
  const webAuth = (
    input.webAuthEndpoint ??
    process.env.WEB_AUTH_ENDPOINT?.trim() ??
    `${base}/anchor/sep10`
  ).replace(/\/$/, "");
  const anchor = (
    input.anchorPublicUrl ??
    process.env.ANCHOR_PUBLIC_URL?.trim() ??
    base
  ).replace(/\/$/, "");
  let body = template.replaceAll("{{PUBLIC_BASE_URL}}", base);
  if (input.omnibusPublicKey) {
    body = body.replaceAll("{{OMNIBUS_PUBLIC_KEY}}", input.omnibusPublicKey);
  }
  body = body.replaceAll("{{ANCHOR_PUBLIC_URL}}", anchor);
  body = body.replaceAll("{{WEB_AUTH_ENDPOINT}}", webAuth);
  body = body.replaceAll("{{SIGNING_KEY}}", signingKey);
  if (input.omnibusPublicKey) {
    body = body.replace(
      /issuer = "[^"]+"/,
      `issuer = "${input.omnibusPublicKey}"`,
    );
    body = body.replace(
      /ACCOUNTS=\[[^\]]*\]/,
      `ACCOUNTS=["${input.omnibusPublicKey}"${input.merchantPublicKey ? `, "${input.merchantPublicKey}"` : ""}]`,
    );
  }
  if (!body.includes("DOCUMENTATION")) {
    body += `\nDOCUMENTATION="https://github.com/lomiafrica/stellar/blob/main/docs/ARCHITECTURE.md"\n`;
  }
  return body;
}
