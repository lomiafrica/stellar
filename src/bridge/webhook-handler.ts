import { isJsonObject, parseJson, readString } from "../json.js";
import { verifyBridgeSignature } from "./webhook.js";
import { hasBridgeEvent, recordBridgeEvent } from "./webhook-store.js";

export interface WebhookHandleResult {
  status: 200 | 400 | 503;
  body: { ok: boolean; duplicate?: boolean; reason?: string };
}

export interface WebhookHandleDeps {
  publicKeyPem?: string;
  now?: number;
}

/** Verify, then record. Duplicate event ids return 200 and do nothing. */
export function handleBridgeWebhook(
  rawBody: string,
  header: string | undefined,
  deps: WebhookHandleDeps = {},
): WebhookHandleResult {
  const pem = deps.publicKeyPem ?? process.env.BRIDGE_WEBHOOK_PUBLIC_KEY?.trim();
  if (!pem) {
    return {
      status: 503,
      body: { ok: false, reason: "BRIDGE_WEBHOOK_PUBLIC_KEY unset" },
    };
  }
  const verified = verifyBridgeSignature(
    rawBody,
    header ?? "",
    pem,
    deps.now,
  );
  if (!verified.ok) {
    return { status: 400, body: { ok: false, reason: verified.reason } };
  }
  let eventId = "";
  try {
    const parsed = parseJson(rawBody);
    if (isJsonObject(parsed)) {
      eventId = readString(parsed, "id") ?? readString(parsed, "event_id") ?? "";
    }
  } catch {
    return { status: 400, body: { ok: false, reason: "invalid json" } };
  }
  if (!eventId) {
    return { status: 400, body: { ok: false, reason: "missing event id" } };
  }
  if (hasBridgeEvent(eventId)) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }
  recordBridgeEvent(eventId);
  return { status: 200, body: { ok: true } };
}
