export class PayoutInFlightError extends Error {
  readonly code = "PAYOUT_IN_FLIGHT";
  constructor(payoutId: string) {
    super(`payout ${payoutId} is already processing`);
    this.name = "PayoutInFlightError";
  }
}

export class PayoutCapError extends Error {
  readonly code = "PAYOUT_CAP";
  readonly reason: "per_payout" | "daily";
  constructor(reason: "per_payout" | "daily", message: string) {
    super(message);
    this.name = "PayoutCapError";
    this.reason = reason;
  }
}
