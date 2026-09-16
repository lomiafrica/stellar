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
  return {
    id: customer.id,
    status: customer.status,
    message: customer.message,
    ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
  };
}

export function callbackAuthOk(
  apiKeyHeader?: string,
  authorization?: string,
): boolean {
  const secret = process.env.CALLBACK_AUTH_SECRET?.trim();
  if (!secret) return true;
  if (apiKeyHeader === secret) return true;
  if (authorization === secret) return true;
  if (
    authorization?.startsWith("Bearer ") &&
    authorization.slice(7) === secret
  ) {
    return true;
  }
  return false;
}
