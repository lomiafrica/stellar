export type LastMileRail = "wave" | "mtn" | "spi";

export interface LastMileRequest {
  rail: LastMileRail;
  amountXof: string;
  phone: string;
  payoutId: string;
  kind: "deposit" | "withdraw";
}

export interface LastMileResult {
  rail: LastMileRail;
  amountXof: string;
  phone: string;
  payoutId: string;
  kind: "deposit" | "withdraw";
  status: "accepted" | "sandbox";
  message: string;
}

export function dispatchLastMile(input: LastMileRequest): LastMileResult {
  const rail: LastMileRail =
    input.rail === "mtn" || input.rail === "spi" ? input.rail : "wave";
  return {
    rail,
    amountXof: input.amountXof,
    phone: input.phone,
    payoutId: input.payoutId,
    kind: input.kind,
    status: "sandbox",
    message: `Sandbox ${rail} ${input.kind}. No live mobile money. Same adapter shape as the production ${rail} rail.`,
  };
}
