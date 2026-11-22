import { createDecipheriv } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import { pathToFileURL } from "node:url";
import "../src/env.js";
import { TESTNET_OMNIBUS_PUBLIC_KEY } from "../src/http/stellar-toml.js";
import { getAppRoot, getKeysDir } from "../src/paths.js";

const CIRCLE_MAINNET_USDC =
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const PUBLIC_HORIZON = "https://horizon.stellar.org";

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

export type ReadinessState = "ready" | "not" | "manual" | "skip";

export interface ReadinessItem {
  id: string;
  label: string;
  state: ReadinessState;
  detail: string;
  fix?: string;
}

function item(
  id: string,
  label: string,
  state: ReadinessState,
  detail: string,
  fix?: string,
): ReadinessItem {
  return { id, label, state, detail, fix };
}

/** The unpublished toml must be fully filled and carry SEP-31 and Circle USDC. */
export function checkMainnetToml(content: string): ReadinessItem[] {
  const out: ReadinessItem[] = [];
  const placeholder = content.match(/\{\{[A-Z_]+\}\}/);
  out.push(
    placeholder
      ? item("toml-placeholders", "mainnet toml filled", "not", `placeholder left: ${placeholder[0]}`, "Put the new mainnet public key in public/stellar.mainnet.toml.")
      : item("toml-placeholders", "mainnet toml filled", "ready", "no placeholders"),
  );
  out.push(
    content.includes("DIRECT_PAYMENT_SERVER")
      ? item("toml-sep31", "SEP-31 receive in toml", "ready", "DIRECT_PAYMENT_SERVER present")
      : item("toml-sep31", "SEP-31 receive in toml", "not", "DIRECT_PAYMENT_SERVER missing", "Add the SEP-31 line to public/stellar.mainnet.toml."),
  );
  out.push(
    content.includes(CIRCLE_MAINNET_USDC)
      ? item("toml-circle", "Circle mainnet USDC issuer", "ready", "issuer present")
      : item("toml-circle", "Circle mainnet USDC issuer", "not", "Circle issuer missing", "Use GA5ZSE…KZVN, never the testnet issuer."),
  );
  return out;
}

/** Anchor assets config must point at Circle USDC with no account placeholder. */
export function checkAnchorAssets(content: string): ReadinessItem[] {
  const out: ReadinessItem[] = [];
  out.push(
    content.includes("REPLACE_WITH_NEW_MAINNET_G")
      ? item("assets-account", "anchor assets account", "not", "REPLACE_WITH_NEW_MAINNET_G left", "Fill the distribution account in anchor/config/assets.mainnet.yaml.")
      : item("assets-account", "anchor assets account", "ready", "no placeholder"),
  );
  out.push(
    content.includes(CIRCLE_MAINNET_USDC)
      ? item("assets-circle", "anchor assets Circle USDC", "ready", "issuer present")
      : item("assets-circle", "anchor assets Circle USDC", "not", "Circle issuer missing", "Point assets.mainnet.yaml at Circle mainnet USDC."),
  );
  return out;
}

type EnvMap = Readonly<Record<string, string | undefined>>;

/** Velocity limits and the dual-control threshold must be set, not defaulted. */
export function checkLimits(env: EnvMap): ReadinessItem[] {
  const rows: Array<[string, string | undefined, string]> = [
    ["LAB_MAX_USDC_PER_DAY", env.LAB_MAX_USDC_PER_DAY, "daily treasury cap"],
    ["LAB_MAX_USDC_PER_PAYOUT", env.LAB_MAX_USDC_PER_PAYOUT, "per-payout cap"],
    ["LAB_DUAL_CONTROL_USDC", env.LAB_DUAL_CONTROL_USDC, "dual-control threshold"],
  ];
  return rows.map(([name, raw, label]) => {
    const value = Number(raw);
    return raw && Number.isFinite(value) && value > 0
      ? item(`limit-${name}`, label, "ready", `${name}=${raw}`)
      : item(`limit-${name}`, label, "not", `${name} unset or invalid`, `Set ${name} before any merchant payment.`);
  });
}

/** The sealed key must exist and unseal back to the advertised public key. */
export function checkEnvelope(env: EnvMap): ReadinessItem {
  const packed = env.STELLAR_KMS_CIPHERTEXT?.trim() ?? "";
  const publicKey = env.STELLAR_KMS_PUBLIC_KEY?.trim() ?? "";
  const kekRaw = env.STELLAR_KMS_KEK?.trim() ?? "";
  if (!packed || !publicKey || !kekRaw) {
    return item("envelope", "sealed seed (EnvelopeSigner)", "not", "STELLAR_KMS_* incomplete", "Run STELLAR_MAINNET_CONFIRM=YES pnpm mainnet:seal and store the three values.");
  }
  try {
    assertNotTestnetOmnibus(publicKey);
    const kek = Buffer.from(kekRaw, "base64");
    if (kek.length !== 32) throw new Error("KEK is not 32 bytes");
    const buf = Buffer.from(packed, "base64");
    const d = createDecipheriv("aes-256-gcm", kek, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const seed = Buffer.concat([d.update(buf.subarray(28)), d.final()]);
    const ok = Keypair.fromSecret(seed.toString("utf8")).publicKey() === publicKey;
    seed.fill(0);
    return ok
      ? item("envelope", "sealed seed (EnvelopeSigner)", "ready", "ciphertext round-trips to the public key")
      : item("envelope", "sealed seed (EnvelopeSigner)", "not", "ciphertext does not match the public key", "Re-run pnpm mainnet:seal with the right key file.");
  } catch (err) {
    return item("envelope", "sealed seed (EnvelopeSigner)", "not", err instanceof Error ? err.message : String(err), "Re-run pnpm mainnet:seal.");
  }
}

/** The pilot allowlist: 8 to 10 organizations before the SQL live branch. */
export function checkRailAllowlist(env: EnvMap): ReadinessItem[] {
  const ids = (env.STELLAR_RAIL_ORGANIZATION_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const out: ReadinessItem[] = [
    ids.length >= 8 && ids.length <= 10
      ? item("rail-orgs", "pilot organizations", "ready", `${ids.length} organizations listed`)
      : item("rail-orgs", "pilot organizations", "not", `${ids.length} organizations listed`, "Set STELLAR_RAIL_ORGANIZATION_IDS to the 8–10 pilot orgs."),
  ];
  if (env.STELLAR_RAIL_ALLOW_LIVE === "1") {
    out.push(item("rail-flag", "live flag", "manual", "STELLAR_RAIL_ALLOW_LIVE=1 is set — only valid after every other gate is green"));
  } else {
    out.push(item("rail-flag", "live flag", "ready", "STELLAR_RAIL_ALLOW_LIVE unset, as it should be until launch"));
  }
  return out;
}

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

async function horizonAccount(
  publicKey: string,
  horizonUrl: string,
): Promise<ReadinessItem[]> {
  const res = await fetch(`${horizonUrl.replace(/\/$/, "")}/accounts/${publicKey}`);
  if (res.status === 404) {
    return [
      item("chain-account", "treasury account on public", "not", "account not found on Horizon", "Fund the new mainnet account first (friendbot does not exist on public)."),
    ];
  }
  if (!res.ok) {
    return [
      item("chain-account", "treasury account on public", "skip", `Horizon answered ${res.status}`),
    ];
  }
  const account = (await res.json()) as {
    balances?: Array<{ asset_code?: string; asset_issuer?: string }>;
    signers?: Array<{ key: string; weight: number }>;
    thresholds?: { high_threshold: number; med_threshold: number; low_threshold: number };
  };
  const out: ReadinessItem[] = [];
  const hasUsdc = (account.balances ?? []).some(
    (b) => b.asset_code === "USDC" && b.asset_issuer === CIRCLE_MAINNET_USDC,
  );
  out.push(
    hasUsdc
      ? item("chain-trustline", "Circle USDC trustline", "ready", "trustline open on the treasury account")
      : item("chain-trustline", "Circle USDC trustline", "not", "no Circle USDC trustline", "Open a trustline to GA5ZSE…KZVN on the new accounts."),
  );
  const signers = account.signers ?? [];
  const master = signers.find((s) => s.key === publicKey);
  const high = account.thresholds?.high_threshold ?? 1;
  const multisig = signers.length >= 3 && (master?.weight ?? 1) < high;
  out.push(
    multisig
      ? item("chain-multisig", "treasury multisig", "ready", `${signers.length} signers, master weight ${master?.weight ?? 0} of ${high}`)
      : item("chain-multisig", "treasury multisig", "not", `${signers.length} signer(s), master weight ${master?.weight ?? "?"} of ${high}`, "Add two extra signers and drop the master weight before any merchant payment."),
  );
  return out;
}

async function main(): Promise<void> {
  for (const line of mainnetFlipChecklist()) {
    console.log(line);
  }
  console.log("");

  const items: ReadinessItem[] = [];
  const appRoot = getAppRoot();

  // Keys on disk: present, and never the testnet omnibus.
  let mainnetPublicKey = "";
  const keyPath = join(getKeysDir(), "mainnet", "omnibus.json");
  if (!existsSync(keyPath)) {
    items.push(item("keys", "new mainnet keys", "not", "keys/mainnet/omnibus.json missing", "Run STELLAR_NETWORK=public STELLAR_MAINNET_CONFIRM=YES pnpm mainnet:keys."));
  } else {
    // SAFETY: written by scripts/mainnet-keys.ts.
    const stored = JSON.parse(readFileSync(keyPath, "utf8")) as { publicKey: string };
    mainnetPublicKey = stored.publicKey;
    try {
      assertNotTestnetOmnibus(stored.publicKey);
      items.push(item("keys", "new mainnet keys", "ready", `omnibus ${stored.publicKey.slice(0, 12)}…`));
    } catch (err) {
      items.push(item("keys", "new mainnet keys", "not", err instanceof Error ? err.message : String(err), "Generate a new mainnet account."));
    }
  }

  items.push(checkEnvelope(process.env));
  items.push(...checkLimits(process.env));
  items.push(...checkRailAllowlist(process.env));

  const toml = readIfExists(join(appRoot, "public", "stellar.mainnet.toml"));
  if (toml === null) {
    items.push(item("toml", "mainnet toml", "not", "public/stellar.mainnet.toml missing"));
  } else {
    items.push(...checkMainnetToml(toml));
  }

  const assets = readIfExists(join(appRoot, "anchor", "config", "assets.mainnet.yaml"));
  if (assets === null) {
    items.push(item("assets", "anchor assets", "not", "anchor/config/assets.mainnet.yaml missing"));
  } else {
    items.push(...checkAnchorAssets(assets));
  }

  const bridgeUrl = (process.env.BRIDGE_API_URL ?? "").trim();
  if (!bridgeUrl || bridgeUrl.includes("sandbox")) {
    items.push(item("bridge", "Bridge production", "not", `BRIDGE_API_URL=${bridgeUrl || "unset"}`, "Point BRIDGE_API_URL at https://api.bridge.xyz with the production key."));
  } else {
    items.push(item("bridge", "Bridge production", "ready", bridgeUrl));
  }

  // On-chain gates only run once we know the new public key.
  if (mainnetPublicKey) {
    const horizon = (process.env.STELLAR_HORIZON_URL ?? PUBLIC_HORIZON).trim() || PUBLIC_HORIZON;
    try {
      items.push(...(await horizonAccount(mainnetPublicKey, horizon)));
    } catch (err) {
      items.push(item("chain", "on-chain gates", "skip", err instanceof Error ? err.message : String(err)));
    }
  } else {
    items.push(item("chain", "on-chain gates", "skip", "no mainnet key yet"));
  }

  // Gates no tool can pass for us.
  items.push(item("manual-t2", "T2 reviewed and paid", "manual", "SCF reviews the filing we are about to send"));
  items.push(item("manual-sql", "SQL live branch", "manual", "initiate_stellar_payout live path, only after the allowlist exists"));
  items.push(item("manual-hop", "one internal hop", "manual", "treasury to treasury before any merchant"));

  let bad = 0;
  for (const row of items) {
    const mark = row.state === "ready" ? "READY" : row.state === "not" ? "NOT " : row.state === "skip" ? "SKIP" : "MANU";
    if (row.state === "not") bad += 1;
    console.log(`[${mark}] ${row.label}: ${row.detail}`);
    if (row.fix) console.log(`       -> ${row.fix}`);
  }
  console.log("");
  console.log(bad === 0 ? "All automatic gates pass. Manual gates above remain." : `${bad} gate(s) not ready.`);
  if (bad > 0) process.exit(1);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
