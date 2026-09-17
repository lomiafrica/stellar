import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PATH = join(process.cwd(), "live-proof.json");

function readProof(): Record<string, unknown> {
  if (!existsSync(PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(PATH, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function recordLiveProof(patch: Record<string, unknown>): void {
  const proof = { ...readProof(), ...patch, updatedAt: new Date().toISOString() };
  writeFileSync(PATH, `${JSON.stringify(proof, null, 2)}\n`);
}

export function liveLabKey(): string {
  return process.env.LAB_API_KEY?.trim() ?? "";
}

export function liveLabUrl(): string {
  return (
    process.env.LIVE_LAB_URL?.replace(/\/$/, "") ??
    "https://lab-production-5fac.up.railway.app"
  );
}

export function labHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const key = liveLabKey();
  if (key) headers["X-Lab-Key"] = key;
  return headers;
}

export function liveAnchorUrl(): string {
  return (
    process.env.LIVE_ANCHOR_URL?.replace(/\/$/, "") ??
    "https://anchor-production-5059.up.railway.app"
  );
}

export function horizonUrl(): string {
  return (
    process.env.STELLAR_HORIZON_URL?.replace(/\/$/, "") ??
    "https://horizon-testnet.stellar.org"
  );
}

export const OMNIBUS_PUBLIC =
  "GD6PH2FAK5DQFFFALZVAT337R7NDGSPWT4R6UBGA5GYLL7N5U4C4GI7I";
export const MERCHANT_PUBLIC =
  "GAOHXCYCLGQDETU33F4AB5DZUSEPRHHEROJ3FCZ6I4S6MDV7FZQVVW2Y";
export const TESTNET_USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown; text: string }> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = { raw: text.slice(0, 2000) };
  }
  return { status: response.status, body, text };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
