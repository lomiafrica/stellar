import { randomUUID } from "node:crypto";
import { dispatchLastMile, type LastMileRail } from "./last-mile.js";
import { assertQuoteUsable } from "./sep38.js";

export interface Sep6Transfer {
  id: string;
  kind: "deposit" | "withdraw";
  status: string;
  amount: string;
  asset: string;
  lastMile: ReturnType<typeof dispatchLastMile>;
  quoteId?: string;
}

export function createSep6Transfer(input: {
  kind: "deposit" | "withdraw";
  amount: string;
  asset?: string;
  phone?: string;
  rail?: LastMileRail;
  quoteId?: string;
}): Sep6Transfer {
  if (input.quoteId) {
    assertQuoteUsable(input.quoteId);
  }
  const payoutId = randomUUID();
  const lastMile = dispatchLastMile({
    rail: input.rail ?? "wave",
    amountXof: input.amount,
    phone: input.phone ?? "+2250700000000",
    payoutId,
    kind: input.kind,
  });
  return {
    id: payoutId,
    kind: input.kind,
    status: "pending_user_transfer_start",
    amount: input.amount,
    asset: input.asset ?? "XOF",
    lastMile,
    quoteId: input.quoteId,
  };
}
