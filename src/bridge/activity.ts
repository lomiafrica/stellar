import { isJsonObject, readString, type JsonObject } from "../json.js";
import {
  readLedger,
  upsertSettlement,
  type StellarSettlementRecord,
} from "../ledger/store.js";
import { log } from "../ops/log.js";

export interface BridgeActivityLink {
  linked: boolean;
  payoutId?: string;
  eventId: string;
}

function eventObject(row: JsonObject): JsonObject | undefined {
  const object = row.event_object;
  return isJsonObject(object) ? object : undefined;
}

function transferKey(row: JsonObject): string {
  const object = eventObject(row);
  if (!object) return "";
  return (
    readString(object, "deposit_id") ??
    readString(object, "id") ??
    readString(row, "event_object_id") ??
    ""
  );
}

function findByBridgeTransferId(
  transferId: string,
): StellarSettlementRecord | undefined {
  if (!transferId) return undefined;
  return readLedger().find((row) => row.bridge_transfer_id === transferId);
}

/**
 * Attach a virtual_account.activity event to the ledger row that already
 * carries the same bridge_transfer_id. Does not create a credit.
 */
export function linkBridgeActivity(row: JsonObject): BridgeActivityLink {
  const eventId =
    readString(row, "event_id") ?? readString(row, "id") ?? "";
  const category = readString(row, "event_category") ?? "";
  const type = readString(row, "event_type") ?? "";
  const activity =
    category.includes("virtual_account.activity") ||
    type.includes("virtual_account.activity");
  if (!activity) {
    return { linked: false, eventId };
  }
  const key = transferKey(row);
  const found = findByBridgeTransferId(key);
  if (!found) {
    log("webhook.received", {
      event_id: eventId,
      linked: false,
      bridge_transfer_id: key,
    });
    return { linked: false, eventId };
  }
  if (found.bridge_event_id === eventId) {
    return { linked: true, payoutId: found.payout_id, eventId };
  }
  upsertSettlement({ ...found, bridge_event_id: eventId });
  log("webhook.received", {
    event_id: eventId,
    linked: true,
    payout_id: found.payout_id,
  });
  return { linked: true, payoutId: found.payout_id, eventId };
}
