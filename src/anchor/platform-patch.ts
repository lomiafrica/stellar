/**
 * Notify Anchor Platform that a SEP-24 interactive flow finished.
 * Uses PLATFORM_API_URL (platform-server, default :8085).
 */
export async function patchPlatformTransaction(input: {
  transactionId: string;
  status: string;
  message: string;
}): Promise<{ ok: boolean; detail: string }> {
  const base = (process.env.PLATFORM_API_URL ?? "").replace(/\/$/, "");
  if (!base) {
    return { ok: false, detail: "PLATFORM_API_URL unset" };
  }
  const secret = process.env.CALLBACK_AUTH_SECRET?.trim() ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) headers["X-Api-Key"] = secret;
  try {
    const response = await fetch(`${base}/transactions`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        records: [
          {
            transaction: {
              id: input.transactionId,
              status: input.status,
              message: input.message,
            },
          },
        ],
      }),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      detail: `${response.status} ${text.slice(0, 200)}`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "platform patch failed",
    };
  }
}
