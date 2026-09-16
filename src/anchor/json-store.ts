import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isJsonObject, parseJson, type JsonObject } from "../json.js";
import { getDataDir } from "../paths.js";

function ensureDataDir(): void {
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function readJsonArray(fileName: string): JsonObject[] {
  ensureDataDir();
  const path = join(getDataDir(), fileName);
  if (!existsSync(path)) return [];
  const parsed = parseJson(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isJsonObject);
}

export function writeJsonArray(fileName: string, rows: JsonObject[]): void {
  ensureDataDir();
  writeFileSync(
    join(getDataDir(), fileName),
    `${JSON.stringify(rows, null, 2)}\n`,
  );
}
