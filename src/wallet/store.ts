import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isJsonObject, parseJson, readString } from "../json.js";

const ORG_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertOrganizationId(organizationId: string): string {
  const id = organizationId.trim().toLowerCase();
  if (!ORG_ID.test(id)) {
    throw new Error("organization_id must be a UUID");
  }
  return id;
}

export type StoredWallet = {
  organizationId: string;
  publicKey: string;
  secret: string;
};

function walletPath(keysDir: string, organizationId: string): string {
  return join(
    keysDir,
    "wallets",
    `${assertOrganizationId(organizationId)}.json`,
  );
}

export function readWallet(
  keysDir: string,
  organizationId: string,
): StoredWallet | null {
  const path = walletPath(keysDir, organizationId);
  if (!existsSync(path)) return null;
  const parsed = parseJson(readFileSync(path, "utf8"));
  if (!isJsonObject(parsed)) return null;
  const publicKey = readString(parsed, "publicKey");
  const secret = readString(parsed, "secret");
  const storedOrg = readString(parsed, "organizationId");
  if (!publicKey || !secret || !storedOrg) return null;
  return { organizationId: storedOrg, publicKey, secret };
}

export function writeWallet(keysDir: string, wallet: StoredWallet): void {
  const id = assertOrganizationId(wallet.organizationId);
  const dir = join(keysDir, "wallets");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.json`);
  writeFileSync(path, `${JSON.stringify(wallet, null, 2)}\n`, { mode: 0o600 });
}
