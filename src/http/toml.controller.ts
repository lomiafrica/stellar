import { Controller, Get, Header } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_BASE_URL } from "../config.js";
import { getAppRoot } from "../paths.js";
import { readStoredKeys } from "../stellar/keys.js";
import { readTestnetProof } from "../testnet-proof.js";
import { renderStellarToml } from "./stellar-toml.js";

@Controller()
export class TomlController {
  @Get(".well-known/stellar.toml")
  @Header("Content-Type", "text/plain; charset=utf-8")
  @Header("Access-Control-Allow-Origin", "*")
  @Header("Cache-Control", "public, max-age=300")
  getToml(): string {
    const root = getAppRoot();
    const template = readFileSync(join(root, "public", "stellar.toml"), "utf8");
    const keys = readStoredKeys();
    const proof = readTestnetProof();
    return renderStellarToml(template, {
      omnibusPublicKey: keys?.omnibus.publicKey ?? proof?.omnibusPublicKey,
      merchantPublicKey: keys?.merchant.publicKey ?? proof?.merchantPublicKey,
      publicBaseUrl: PUBLIC_BASE_URL,
      sep10SigningSeed: process.env.SEP10_SIGNING_SEED,
      sep10SigningPublicKey: process.env.SEP10_SIGNING_PUBLIC_KEY,
    });
  }
}
