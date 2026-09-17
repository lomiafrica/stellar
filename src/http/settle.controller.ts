import { Body, Controller, Headers, Post } from "@nestjs/common";
import { runSettlementDemo } from "../settlement-demo.js";
import { assertLabMutatingAuth } from "./lab-auth.js";

@Controller("demo")
export class SettleController {
  /** Thin settle helper; prefer POST /demo/payouts */
  @Post("settle")
  async settle(
    @Body()
    body: {
      amount?: string;
      payout_id?: string;
      phone?: string;
      organization_id?: string;
      destination?: "self" | "beneficiary";
      last_mile_rail?: "wave" | "mtn" | "spi" | "bank";
      currency_code?: string;
      amount_number?: number;
    },
    @Headers("x-lab-key") labKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    assertLabMutatingAuth(labKey, authorization);
    return runSettlementDemo({
      amount: body.amount,
      payoutId: body.payout_id,
      phone: body.phone,
      organization_id: body.organization_id,
      destination: body.destination,
      last_mile_rail: body.last_mile_rail,
      currency_code: body.currency_code,
      amount_number: body.amount_number,
    });
  }
}
