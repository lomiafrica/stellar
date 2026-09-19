import { randomUUID } from "node:crypto";
import { readString, type JsonObject } from "../json.js";
import { readJsonArray, writeJsonArray } from "../anchor/json-store.js";

export type BridgeTransferStatus =
  "awaiting_funds" | "payment_processed" | "completed" | "failed" | "refunded";

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

function persist(transfer: BridgeTransfer): void {
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
  persist(transfer);
  return transfer;
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
  singleton ??= new MockBridgeAdapter();
  return singleton;
}

export function setBridgeAdapter(adapter: BridgeAdapter | undefined): void {
  singleton = adapter;
}

/** @deprecated use BridgeTransfer */
export type MockBridgeTransfer = BridgeTransfer;
