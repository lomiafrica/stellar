import { randomUUID } from "node:crypto";
import { readString, type JsonObject } from "../json.js";
import { readJsonArray, writeJsonArray } from "../anchor/json-store.js";
import {
  BridgeApiError,
  bridgeClientFromEnv,
  readBridgeId,
  type BridgeClient,
} from "./client.js";

export type BridgeTransferStatus =
  | "awaiting_funds"
  | "payment_processed"
  | "completed"
  | "failed"
  | "refunded";

export interface BridgeTransfer {
  id: string;
  usdAmount: string;
  usdcAmount: string;
  stellarNetwork: "testnet" | "public";
  status: BridgeTransferStatus;
  createdAt: string;
}

export interface BridgeAdapter {
  createTransfer(input: { usdAmount: string }): Promise<BridgeTransfer>;
  getTransfer(id: string): Promise<BridgeTransfer | undefined>;
}

const STORE = "bridge_transfers.json";
const memory = new Map<string, BridgeTransfer>();

export function saveBridgeTransfer(transfer: BridgeTransfer): void {
  memory.set(transfer.id, transfer);
  const rows = readJsonArray(STORE).filter(
    (row) => readString(row, "id") !== transfer.id,
  );
  const next: JsonObject = {
    id: transfer.id,
    usd_amount: transfer.usdAmount,
    usdc_amount: transfer.usdcAmount,
    stellar_network: transfer.stellarNetwork,
    status: transfer.status,
    created_at: transfer.createdAt,
  };
  rows.push(next);
  writeJsonArray(STORE, rows);
}

function fromRow(row: JsonObject): BridgeTransfer {
  const status = readString(row, "status");
  const network = readString(row, "stellar_network");
  return {
    id: readString(row, "id") ?? "",
    usdAmount: readString(row, "usd_amount") ?? "",
    usdcAmount: readString(row, "usdc_amount") ?? "",
    stellarNetwork: network === "public" ? "public" : "testnet",
    status: isStatus(status) ? status : "completed",
    createdAt: readString(row, "created_at") ?? "",
  };
}

function isStatus(value: string | undefined): value is BridgeTransferStatus {
  return (
    value === "awaiting_funds" ||
    value === "payment_processed" ||
    value === "completed" ||
    value === "failed" ||
    value === "refunded"
  );
}

/** Sync mock used by POST /mock/bridge/fund. Same id shape as the adapter. */
export function mockBridgeUsdToUsdc(usdAmount: string): BridgeTransfer {
  const transfer: BridgeTransfer = {
    id: `bridge_mock_${randomUUID().slice(0, 8)}`,
    usdAmount,
    usdcAmount: usdAmount,
    stellarNetwork: "testnet",
    status: "completed",
    createdAt: new Date().toISOString(),
  };
  saveBridgeTransfer(transfer);
  return transfer;
}

const OMNIBUS_PUBLIC =
  "GD6PH2FAK5DQFFFALZVAT337R7NDGSPWT4R6UBGA5GYLL7N5U4C4GI7I";

/** Bridge `payment_processed` is the success state. Three-way reconcile expects `completed`. */
export function mapBridgeStatus(raw: string | undefined): BridgeTransferStatus {
  switch (raw) {
    case "awaiting_funds":
      return "awaiting_funds";
    case "funds_received":
    case "payment_submitted":
      return "payment_processed";
    case "payment_processed":
    case "completed":
      return "completed";
    case "returned":
    case "refunded":
      return "refunded";
    case "canceled":
    case "cancelled":
    case "undeliverable":
    case "error":
    case "failed":
      return "failed";
    default:
      return "awaiting_funds";
  }
}

function transferFromApi(row: JsonObject, fallbackUsd: string): BridgeTransfer {
  return {
    id: readBridgeId(row),
    usdAmount: readString(row, "amount") ?? fallbackUsd,
    usdcAmount:
      readString(row, "destination_amount") ??
      readString(row, "amount") ??
      fallbackUsd,
    stellarNetwork: "testnet",
    status: mapBridgeStatus(
      readString(row, "state") ?? readString(row, "status"),
    ),
    createdAt: readString(row, "created_at") ?? new Date().toISOString(),
  };
}

export class BridgeSandboxAdapter implements BridgeAdapter {
  constructor(private readonly client: BridgeClient = bridgeClientFromEnv()) {}

  async createTransfer(input: { usdAmount: string }): Promise<BridgeTransfer> {
    const customerId = process.env.BRIDGE_CUSTOMER_ID?.trim() ?? "";
    if (!customerId) {
      throw new Error("BRIDGE_CUSTOMER_ID unset");
    }
    const address = process.env.OMNIBUS_PUBLIC_KEY?.trim() || OMNIBUS_PUBLIC;
    const created = await this.client.createTransfer({
      amount: input.usdAmount,
      onBehalfOf: customerId,
      address,
      blockchainMemo: "lomi",
    });
    const transfer = transferFromApi(created, input.usdAmount);
    saveBridgeTransfer(transfer);
    return transfer;
  }

  async getTransfer(id: string): Promise<BridgeTransfer | undefined> {
    try {
      const row = await this.client.getTransfer(id);
      const transfer = transferFromApi(row, "");
      if (!transfer.id) return undefined;
      saveBridgeTransfer(transfer);
      return transfer;
    } catch (err) {
      if (err instanceof BridgeApiError && err.status === 404) {
        return undefined;
      }
      const hit = memory.get(id);
      if (hit) return hit;
      const row = readJsonArray(STORE).find(
        (entry) => readString(entry, "id") === id,
      );
      return row ? fromRow(row) : undefined;
    }
  }
}

export class MockBridgeAdapter implements BridgeAdapter {
  async createTransfer(input: { usdAmount: string }): Promise<BridgeTransfer> {
    return mockBridgeUsdToUsdc(input.usdAmount);
  }

  async getTransfer(id: string): Promise<BridgeTransfer | undefined> {
    const hit = memory.get(id);
    if (hit) return hit;
    const row = readJsonArray(STORE).find(
      (entry) => readString(entry, "id") === id,
    );
    return row ? fromRow(row) : undefined;
  }
}

let singleton: BridgeAdapter | undefined;

export function getBridgeAdapter(): BridgeAdapter {
  if (!singleton) {
    singleton = process.env.BRIDGE_API_KEY?.trim()
      ? new BridgeSandboxAdapter()
      : new MockBridgeAdapter();
  }
  return singleton;
}

export function setBridgeAdapter(adapter: BridgeAdapter | undefined): void {
  singleton = adapter;
}

/** @deprecated use BridgeTransfer */
export type MockBridgeTransfer = BridgeTransfer;
