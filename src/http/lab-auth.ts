import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { PUBLIC_BASE_URL } from "../config.js";

/** True when this process is reachable as a public host, not a local operator. */
export function isPublicDeploy(
  baseUrl = process.env.PUBLIC_BASE_URL ?? PUBLIC_BASE_URL,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  if (nodeEnv === "test") return false;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return false;
    }
    return true;
  } catch {
    return nodeEnv === "production";
  }
}

export function secretsEqual(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function labApiKey(): string {
  return process.env.LAB_API_KEY?.trim() ?? "";
}

export function readLabKey(xLabKey?: string, authorization?: string): string {
  const direct = xLabKey?.trim() ?? "";
  if (direct) return direct;
  const auth = authorization?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

/**
 * Mutating demo routes: 503 when the public lab has no key, 401 on mismatch.
 * Local operator processes with no PUBLIC_BASE_URL stay open.
 */
export function assertLabMutatingAuth(
  xLabKey?: string,
  authorization?: string,
): void {
  const expected = labApiKey();
  if (!expected) {
    if (isPublicDeploy()) {
      throw new ServiceUnavailableException({
        success: false,
        reason: "LAB_API_KEY unset",
      });
    }
    return;
  }
  const given = readLabKey(xLabKey, authorization);
  if (!given || !secretsEqual(given, expected)) {
    throw new UnauthorizedException({
      success: false,
      reason: "lab key required",
    });
  }
}
