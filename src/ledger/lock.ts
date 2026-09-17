import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../paths.js";

const STALE_MS = 10_000;
const WAIT_MS = 15;
const DEADLINE_MS = 5_000;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Exclusive file lock for read-modify-write of JSON ledgers. */
export function withNamedLock<T>(name: string, fn: () => T): T {
  const dir = getDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.lock`);
  const deadline = Date.now() + DEADLINE_MS;
  while (true) {
    try {
      if (existsSync(path)) {
        const age = Date.now() - statSync(path).mtimeMs;
        if (age > STALE_MS) unlinkSync(path);
      }
    } catch {
      /* ignore */
    }
    try {
      const fd = openSync(path, "wx");
      try {
        writeSync(fd, String(process.pid));
        return fn();
      } finally {
        closeSync(fd);
        try {
          unlinkSync(path);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      if (Date.now() > deadline) throw err;
      sleep(WAIT_MS);
    }
  }
}
