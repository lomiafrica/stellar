import type { JsonObject } from "../json.js";
import { log } from "./log.js";

export type AlertFetch = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean }>;

let fetchImpl: AlertFetch = (url, init) => fetch(url, init);

export function setAlertFetch(next: AlertFetch | undefined): void {
  fetchImpl =
    next ??
    ((url, init) => {
      return fetch(url, init);
    });
}

/**
 * Log the event and, when ALERT_WEBHOOK_URL is set, POST a Slack-shaped `{ text }`.
 * A missing URL or a dead endpoint does not throw.
 */
export async function notifyAlert(
  event: string,
  fields: JsonObject = {},
): Promise<boolean> {
  log(event, fields);
  const url = process.env.ALERT_WEBHOOK_URL?.trim() ?? "";
  if (!url) return false;
  const text = `${event} ${JSON.stringify(fields)}`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

