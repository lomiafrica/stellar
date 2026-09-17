import { isJsonObject, parseJson, readString } from "../json.js";
import { parsePemList, verifyBridgeSignatureAny } from "./webhook.js";
import { tryRecordBridgeEvent } from "./webhook-store.js";

export interface WebhookHandleResult {
  status: 200 | 400 | 503;
  body: { ok: boolean; duplicate?: boolean; reason?: string };
}

export interface WebhookHandleDeps {
  publicKeyPem?: string;
  publicKeyPems?: string[];
  now?: number;
}

function pemsFromEnv(): string[] {
  const raw = process.env.BRIDGE_WEBHOOK_PUBLIC_KEY?.trim() ?? "";
  return parsePemList(raw);
}

/** Verify against any configured PEM, then insert-or-reject the event id. */
export function handleBridgeWebhook(
  rawBody: string,
  header: string | undefined,
  deps: WebhookHandleDeps = {},
): WebhookHandleResult {
  const pems =
    deps.publicKeyPems ??
    (deps.publicKeyPem !== undefined
      ? parsePemList(deps.publicKeyPem)
      : pemsFromEnv());
  if (pems.length === 0) {
    return {
      status: 503,
      body: { ok: false, reason: "BRIDGE_WEBHOOK_PUBLIC_KEY unset" },
    };
  }
  const verified = verifyBridgeSignatureAny(
    rawBody,
    header ?? "",
    pems,
    deps.now,
  );
  if (!verified.ok) {
    return { status: 400, body: { ok: false, reason: verified.reason } };
  }
  let eventId = "";
  try {
    const parsed = parseJson(rawBody);
    if (isJsonObject(parsed)) {
      eventId =
        readString(parsed, "id") ?? readString(parsed, "event_id") ?? "";
    }
  } catch {
    return { status: 400, body: { ok: false, reason: "invalid json" } };
  }
  if (!eventId) {
    return { status: 400, body: { ok: false, reason: "missing event id" } };
  }
  if (!tryRecordBridgeEvent(eventId)) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }
  return { status: 200, body: { ok: true } };
}
