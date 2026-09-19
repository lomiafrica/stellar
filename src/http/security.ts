const WINDOW_MS = 60_000;
const MAX_MUTATING = 60;

const hits = new Map<string, number[]>();

type SecurityHeaderMap = {
  "X-Content-Type-Options": string;
  "X-Frame-Options": string;
  "Referrer-Policy": string;
  "Content-Security-Policy": string;
};

export function securityHeaders(): SecurityHeaderMap {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'",
  };
}

export function corsOrigins(): string[] | true {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw || raw === "*") return true;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** Sliding window on mutating methods. GET/HEAD/OPTIONS stay unlimited. */
export function rateLimitOk(
  ip: string,
  now = Date.now(),
  max = MAX_MUTATING,
): boolean {
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

export function resetRateLimitForTests(): void {
  hits.clear();
}
