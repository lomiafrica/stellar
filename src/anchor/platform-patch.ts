import { notifyAlert } from "../ops/alert.js";

export type PlatformFetch = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface PlatformPatchDeps {
  fetchImpl?: PlatformFetch;
  sleep?: (ms: number) => Promise<void>;
}

// Railway sleeps the anchor. Its platform server listens a second or two after the SEP server.
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];
const ATTEMPT_TIMEOUT_MS = 5_000;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Notify Anchor Platform that a SEP-24 interactive flow finished.
 * Uses PLATFORM_API_URL (platform-server, default :8085).
 * A network error or a 5xx is retried; a 4xx is final.
 */
export async function patchPlatformTransaction(
  input: {
    transactionId: string;
    status: string;
    message: string;
  },
  deps: PlatformPatchDeps = {},
): Promise<{ ok: boolean; detail: string }> {
  const base = (process.env.PLATFORM_API_URL ?? "").replace(/\/$/, "");
  if (!base) {
    return { ok: false, detail: "PLATFORM_API_URL unset" };
  }
  const fetchImpl: PlatformFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? wait;
  const secret = process.env.CALLBACK_AUTH_SECRET?.trim() ?? "";
  type PlatformPatchHeaders = {
    "Content-Type": string;
    "X-Api-Key"?: string;
  };
  const headers: PlatformPatchHeaders = {
    "Content-Type": "application/json",
  };
  if (secret) headers["X-Api-Key"] = secret;
  const body = JSON.stringify({
    records: [
      {
        transaction: {
          id: input.transactionId,
          status: input.status,
          message: input.message,
        },
      },
    ],
  });

  let detail = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      const response = await fetchImpl(`${base}/transactions`, {
        method: "PATCH",
        headers,
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      const text = await response.text();
      detail = `${response.status} ${text.slice(0, 200)}`;
      if (response.ok) return { ok: true, detail };
      if (response.status < 500) break;
    } catch (err) {
      detail = err instanceof Error ? err.message : "platform patch failed";
    }
  }
  await notifyAlert("sep24.platform_patch_failed", {
    transaction_id: input.transactionId,
    status: input.status,
    detail,
  });
  return { ok: false, detail };
}
