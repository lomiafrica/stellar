import { Networks } from "@stellar/stellar-sdk";
import "./env.js";

export type StellarNetworkName = "testnet" | "public";

export const TESTNET_USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const MAINNET_USDC_ISSUER =
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

export const CIRCLE_FAUCET_URL = "https://faucet.circle.com";

export class MainnetGuardError extends Error {
  readonly code = "MAINNET_GUARD";
  constructor(message: string) {
    super(message);
    this.name = "MainnetGuardError";
  }
}

export function assertMainnetAllowed(): void {
  if (process.env.STELLAR_MAINNET_CONFIRM !== "YES") {
    throw new MainnetGuardError(
      "Mainnet refused. Set STELLAR_NETWORK=public and STELLAR_MAINNET_CONFIRM=YES. Use a new G… key. Do not reuse testnet secrets.",
    );
  }
}

export function getStellarNetwork(): StellarNetworkName {
  const raw = (process.env.STELLAR_NETWORK ?? "testnet").trim().toLowerCase();
  if (raw === "public" || raw === "mainnet") {
    assertMainnetAllowed();
    return "public";
  }
  return "testnet";
}

/** Boot check: public network cannot use Circle testnet USDC, and cannot skip confirm. */
export function assertDeployNetwork(): void {
  const raw = (process.env.STELLAR_NETWORK ?? "testnet").trim().toLowerCase();
  if (raw !== "public" && raw !== "mainnet") return;
  assertMainnetAllowed();
  const issuer = process.env.STELLAR_USDC_ISSUER?.trim() || MAINNET_USDC_ISSUER;
  if (issuer === TESTNET_USDC_ISSUER) {
    throw new MainnetGuardError(
      "Mainnet cannot use Circle testnet USDC issuer GBBD47IF…",
    );
  }
}

const network = (): StellarNetworkName => {
  try {
    return getStellarNetwork();
  } catch {
    return "testnet";
  }
};

const isPublic = network() === "public";

export const STELLAR_RPC_URL =
  process.env.STELLAR_RPC_URL ??
  (isPublic
    ? "https://soroban.stellar.org"
    : "https://soroban-testnet.stellar.org");
export const STELLAR_HORIZON_URL =
  process.env.STELLAR_HORIZON_URL ??
  (isPublic
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org");
export const STELLAR_USDC_ISSUER =
  process.env.STELLAR_USDC_ISSUER ??
  (isPublic ? MAINNET_USDC_ISSUER : TESTNET_USDC_ISSUER);
export const NETWORK_PASSPHRASE = isPublic ? Networks.PUBLIC : Networks.TESTNET;
export const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ?? "http://localhost:3456";
export const PORT = Number(process.env.PORT ?? 3456);

export const DEFAULT_DEMO_ORGANIZATION_ID =
  process.env.DEMO_ORGANIZATION_ID ?? "00000000-0000-4000-8000-000000000001";

export const EXPLORER_BASE = isPublic
  ? "https://stellar.expert/explorer/public"
  : "https://stellar.expert/explorer/testnet";

export function explorerAccount(publicKey: string): string {
  return `${EXPLORER_BASE}/account/${publicKey}`;
}

export function explorerTx(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`;
}
