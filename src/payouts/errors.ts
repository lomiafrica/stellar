export class PayoutInFlightError extends Error {
  readonly code = "PAYOUT_IN_FLIGHT";
  constructor(payoutId: string) {
    super(`payout ${payoutId} is already processing`);
    this.name = "PayoutInFlightError";
  }
}

export class DualControlError extends Error {
  readonly code = "DUAL_CONTROL";
  constructor(message: string) {
    super(message);
    this.name = "DualControlError";
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
