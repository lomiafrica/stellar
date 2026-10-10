import {
  isJsonObject,
  parseJson,
  readString,
  type JsonObject,
} from "../json.js";
import { linkBridgeActivity } from "./activity.js";
import { notifyAlert } from "../ops/alert.js";
import { log } from "../ops/log.js";
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
    void notifyAlert("webhook.rejected", {
      reason: verified.reason ?? "rejected",
    });
    return { status: 400, body: { ok: false, reason: verified.reason } };
  }
  let eventId = "";
  let parsedRow: JsonObject | undefined;
  try {
    const parsed = parseJson(rawBody);
    if (isJsonObject(parsed)) {
      parsedRow = parsed;
      eventId =
        readString(parsed, "id") ?? readString(parsed, "event_id") ?? "";
    }
  } catch {
    void notifyAlert("webhook.rejected", { reason: "invalid json" });
    return { status: 400, body: { ok: false, reason: "invalid json" } };
  }
  if (!eventId) {
    void notifyAlert("webhook.rejected", { reason: "missing event id" });
    return { status: 400, body: { ok: false, reason: "missing event id" } };
  }
  if (!tryRecordBridgeEvent(eventId)) {
    log("webhook.duplicate", { event_id: eventId });
    return { status: 200, body: { ok: true, duplicate: true } };
  }
  if (parsedRow) linkBridgeActivity(parsedRow);
  else log("webhook.received", { event_id: eventId });
  return { status: 200, body: { ok: true } };
}
