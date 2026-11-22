import { randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAnchorAssets,
  checkEnvelope,
  checkLimits,
  checkMainnetToml,
  checkRailAllowlist,
} from "../scripts/mainnet-check.js";
import { sealSecret } from "../src/stellar/signer.js";

const CIRCLE = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

test("checkMainnetToml flags placeholders and requires SEP-31 and Circle", () => {
  const bad = checkMainnetToml('ACCOUNTS=["{{OMNIBUS_PUBLIC_KEY}}"]');
  assert.equal(bad.find((i) => i.id === "toml-placeholders")?.state, "not");
  assert.equal(bad.find((i) => i.id === "toml-sep31")?.state, "not");
  assert.equal(bad.find((i) => i.id === "toml-circle")?.state, "not");

  const good = checkMainnetToml(
    `ACCOUNTS=["GABC"]\nDIRECT_PAYMENT_SERVER="https://lomi.africa/anchor/sep31"\nissuer = "${CIRCLE}"`,
  );
  assert.ok(good.every((i) => i.state === "ready"));
});

test("checkAnchorAssets flags the account placeholder and requires Circle", () => {
  const bad = checkAnchorAssets("distribution: REPLACE_WITH_NEW_MAINNET_G");
  assert.equal(bad.find((i) => i.id === "assets-account")?.state, "not");
  assert.equal(bad.find((i) => i.id === "assets-circle")?.state, "not");

  const good = checkAnchorAssets(`- id: stellar:USDC:${CIRCLE}`);
  assert.ok(good.every((i) => i.state === "ready"));
});

test("checkLimits wants three positive numbers", () => {
  const missing = checkLimits({
    LAB_MAX_USDC_PER_DAY: "",
    LAB_MAX_USDC_PER_PAYOUT: "50",
    LAB_DUAL_CONTROL_USDC: "100",
  });
  assert.equal(missing[0]?.state, "not");
  assert.equal(missing[1]?.state, "ready");
  assert.equal(missing[2]?.state, "ready");

  const zero = checkLimits({
    LAB_MAX_USDC_PER_DAY: "0",
    LAB_MAX_USDC_PER_PAYOUT: "50",
    LAB_DUAL_CONTROL_USDC: "100",
  });
  assert.equal(zero[0]?.state, "not");
});

test("checkEnvelope round-trips a sealed seed and rejects mismatches", () => {
  const kp = Keypair.random();
  const kek = randomBytes(32);
  const good = checkEnvelope({
    STELLAR_KMS_CIPHERTEXT: sealSecret(kp.secret(), kek),
    STELLAR_KMS_PUBLIC_KEY: kp.publicKey(),
    STELLAR_KMS_KEK: kek.toString("base64"),
  });
  assert.equal(good.state, "ready");

  const other = Keypair.random();
  const wrong = checkEnvelope({
    STELLAR_KMS_CIPHERTEXT: sealSecret(kp.secret(), kek),
    STELLAR_KMS_PUBLIC_KEY: other.publicKey(),
    STELLAR_KMS_KEK: kek.toString("base64"),
  });
  assert.equal(wrong.state, "not");

  const missing = checkEnvelope({
    STELLAR_KMS_CIPHERTEXT: "",
    STELLAR_KMS_PUBLIC_KEY: "",
    STELLAR_KMS_KEK: "",
  });
  assert.equal(missing.state, "not");
});

test("checkRailAllowlist wants 8 to 10 orgs and the flag unset", () => {
  const ids = Array.from({ length: 9 }, (_, i) => `org-${i}`).join(",");
  const good = checkRailAllowlist({
    STELLAR_RAIL_ORGANIZATION_IDS: ids,
    STELLAR_RAIL_ALLOW_LIVE: "",
  });
  assert.equal(good.find((i) => i.id === "rail-orgs")?.state, "ready");
  assert.equal(good.find((i) => i.id === "rail-flag")?.state, "ready");

  const few = checkRailAllowlist({
    STELLAR_RAIL_ORGANIZATION_IDS: "a,b,c",
    STELLAR_RAIL_ALLOW_LIVE: "1",
  });
  assert.equal(few.find((i) => i.id === "rail-orgs")?.state, "not");
  assert.equal(few.find((i) => i.id === "rail-flag")?.state, "manual");
});
