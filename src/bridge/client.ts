import { randomUUID } from "node:crypto";
import { isJsonObject, parseJson, readString, type JsonObject } from "../json.js";

export class BridgeApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "BridgeApiError";
    this.status = status;
  }
}

export type BridgeFetch = (
  url: string,
  init: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export interface BridgeClientOptions {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: BridgeFetch;
}

export interface BridgeCustomerInput {
  email: string;
  firstName: string;
  lastName: string;
}

export interface BridgeVirtualAccountInput {
  customerId: string;
  address: string;
  blockchainMemo: string;
}

export interface BridgeTransferInput {
  amount: string;
  onBehalfOf: string;
  address: string;
  blockchainMemo?: string;
}

export interface BridgeWebhookInput {
  url: string;
  eventCategories: string[];
}

const DEFAULT_BASE = "https://api.sandbox.bridge.xyz";

export type BridgeHeaders = {
  "Content-Type": string;
  "Api-Key": string;
  "Idempotency-Key"?: string;
};

function asObject(text: string): JsonObject {
  try {
    const parsed = parseJson(text);
    return isJsonObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export class BridgeClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: BridgeFetch;

  constructor(options: BridgeClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(
    method: string,
    path: string,
    body?: JsonObject,
  ): Promise<JsonObject> {
    const headers: BridgeHeaders = {
      "Content-Type": "application/json",
      "Api-Key": this.apiKey,
    };
    if (method !== "GET") headers["Idempotency-Key"] = randomUUID();
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new BridgeApiError(
        response.status,
        `${method} ${path} ${response.status}: ${text.slice(0, 240)}`,
      );
    }
    return asObject(text);
  }

  createCustomer(input: BridgeCustomerInput): Promise<JsonObject> {
    return this.request("POST", "/v0/customers", {
      type: "individual",
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      has_accepted_terms_of_service: true,
    });
  }

  simulateKycApproval(customerId: string): Promise<JsonObject> {
    return this.request(
      "POST",
      `/v0/customers/${encodeURIComponent(customerId)}/simulate_kyc_approval`,
      {},
    );
  }

  createVirtualAccount(input: BridgeVirtualAccountInput): Promise<JsonObject> {
    return this.request(
      "POST",
      `/v0/customers/${encodeURIComponent(input.customerId)}/virtual_accounts`,
      {
        source: { currency: "usd" },
        destination: {
          payment_rail: "stellar",
          currency: "usdc",
          address: input.address,
          blockchain_memo: input.blockchainMemo,
        },
      },
    );
  }

  getTransfer(id: string): Promise<JsonObject> {
    return this.request("GET", `/v0/transfers/${encodeURIComponent(id)}`);
  }

  createTransfer(input: BridgeTransferInput): Promise<JsonObject> {
    return this.request("POST", "/v0/transfers", {
      amount: input.amount,
      on_behalf_of: input.onBehalfOf,
      source: { payment_rail: "ach_push", currency: "usd" },
      destination: {
        payment_rail: "stellar",
        currency: "usdc",
        to_address: input.address,
        blockchain_memo: input.blockchainMemo ?? "lomi",
      },
    });
  }

  createWebhook(input: BridgeWebhookInput): Promise<JsonObject> {
    return this.request("POST", "/v0/webhooks", {
      url: input.url,
      event_epoch: "webhook_creation",
      event_categories: input.eventCategories,
    });
  }

  enableWebhook(webhookId: string): Promise<JsonObject> {
    return this.request(
      "PUT",
      `/v0/webhooks/${encodeURIComponent(webhookId)}`,
      { status: "active" },
    );
  }

  sendWebhookEvent(webhookId: string, eventId: string): Promise<JsonObject> {
    return this.request(
      "POST",
      `/v0/webhooks/${encodeURIComponent(webhookId)}/send`,
      { event_id: eventId },
    );
  }
}

export function bridgeClientFromEnv(): BridgeClient {
  return new BridgeClient({
    apiKey: process.env.BRIDGE_API_KEY?.trim() ?? "",
    baseUrl: process.env.BRIDGE_API_URL?.trim() || DEFAULT_BASE,
  });
}

export function readBridgeId(row: JsonObject): string {
  return readString(row, "id") ?? "";
}
