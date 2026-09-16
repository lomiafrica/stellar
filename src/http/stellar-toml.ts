import { Keypair } from "@stellar/stellar-sdk";
import { PUBLIC_BASE_URL } from "../config.js";

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
    sep10SigningSeed?: string;
    sep10SigningPublicKey?: string;
  },
): string {
  const base = (input.publicBaseUrl ?? PUBLIC_BASE_URL).replace(/\/$/, "");
  const signingKey = signingPublicKey(input);
  const webAuth = (
    input.webAuthEndpoint ??
    process.env.WEB_AUTH_ENDPOINT?.trim() ??
    `${base}/anchor/sep10`
  ).replace(/\/$/, "");
  let body = template.replaceAll("{{PUBLIC_BASE_URL}}", base);
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
