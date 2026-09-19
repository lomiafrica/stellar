import { timingSafeEqual } from "node:crypto";
import { isPublicDeploy } from "../http/lab-auth.js";
import type { Sep12Customer } from "./merchant-verify.js";

export type CallbackField = {
  type: "string";
  description: string;
  optional: boolean;
};

export type CallbackCustomer = {
  id: string;
  status: Sep12Customer["status"];
  message?: string;
  fields?: Record<string, CallbackField>;
};

/**
 * Shape the Anchor Platform Callback API expects for GET/PUT /customer.
 */
export function toCallbackCustomer(customer: Sep12Customer): CallbackCustomer {
  const fields: Record<string, CallbackField> | undefined =
    customer.status === "NEEDS_INFO"
      ? Object.fromEntries(
          Object.entries(customer.fields ?? {}).map(([key, description]) => [
            key,
            { type: "string" as const, description, optional: false },
          ]),
        )
      : undefined;
  const customerOut: CallbackCustomer = {
    id: customer.id,
    status: customer.status,
    message: customer.message,
  };
  if (fields && Object.keys(fields).length > 0) {
    customerOut.fields = fields;
  }
  return customerOut;
}

function secretsEqual(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function callbackAuthOk(
  apiKeyHeader?: string,
  authorization?: string,
): boolean {
  const secret = process.env.CALLBACK_AUTH_SECRET?.trim();
  if (!secret) return !isPublicDeploy();
  if (apiKeyHeader && secretsEqual(apiKeyHeader, secret)) return true;
  if (authorization && secretsEqual(authorization, secret)) return true;
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7);
    if (secretsEqual(token, secret)) return true;
  }
  return false;
}
