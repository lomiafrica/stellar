import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { SettleNotReadyError } from "../operator/ready.js";
import {
  beginIdempotency,
  saveIdempotentResponse,
} from "../ledger/idempotency.js";
import {
  findByPayoutId,
  publicSettlement,
  readLedger,
} from "../ledger/store.js";
import {
  reconcileThreeWay,
  reconcileTransaction,
} from "../ledger/reconcile.js";
import {
  createStellarPayout,
  notReadyBody,
} from "../payouts/stellar-payout.service.js";
import { PayoutCapError, PayoutInFlightError } from "../payouts/errors.js";
import {
  renderPayoutListPage,
  renderPayoutPage,
} from "../payouts/payout-pages.js";
import type { CreateStellarPayoutInput } from "../payouts/types.js";
import type { JsonObject } from "../json.js";
import { prefersHtml } from "./page-chrome.js";
import { assertLabMutatingAuth } from "./lab-auth.js";

@Controller("demo/payouts")
export class DemoPayoutsController {
  @Post()
  async create(
    @Body()
    body: {
      destination: "self" | "beneficiary";
      rail: "stellar";
      amount: number;
      currency_code: string;
      payout_id?: string;
      organization_id?: string;
      last_mile_rail?: "wave" | "mtn" | "spi" | "bank";
      payout_method_id?: string;
      recipient?: { name: string; phone: string };
      reason?: string;
      metadata?: JsonObject;
      amount_usdc?: string;
      bridge_transfer_id?: string;
    },
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-lab-key") labKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    assertLabMutatingAuth(labKey, authorization);
    if (body.rail !== "stellar") {
      return {
        success: false,
        message: "This demo only supports rail=stellar.",
      };
    }

    if (idempotencyKey) {
      const begun = beginIdempotency(idempotencyKey);
      if (begun.kind === "hit") return begun.response;
      if (begun.kind === "busy") {
        throw new ConflictException({
          success: false,
          reason: "idempotency key in flight",
        });
      }
    }

    const input: CreateStellarPayoutInput = {
      destination: body.destination,
      rail: "stellar",
      amount: body.amount,
      currency_code: body.currency_code,
      payout_id: body.payout_id,
      organization_id: body.organization_id,
      last_mile_rail: body.last_mile_rail,
      payout_method_id: body.payout_method_id,
      recipient: body.recipient,
      reason: body.reason,
      metadata: body.metadata,
      amount_usdc: body.amount_usdc,
      phone: body.recipient?.phone,
      bridge_transfer_id: body.bridge_transfer_id,
    };

    try {
      const response = await createStellarPayout(input);
      if (idempotencyKey) {
        saveIdempotentResponse(idempotencyKey, response.payout_id, response);
      }
      return response;
    } catch (err) {
      if (err instanceof SettleNotReadyError) {
        throw new BadRequestException(notReadyBody(err));
      }
      if (err instanceof PayoutCapError) {
        throw new BadRequestException({
          success: false,
          reason: err.reason,
          message: err.message,
        });
      }
      if (err instanceof PayoutInFlightError) {
        throw new ConflictException({
          success: false,
          reason: "payout in flight",
          message: err.message,
        });
      }
      throw err;
    }
  }

  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  list(): string {
    return renderPayoutListPage(readLedger().map(publicSettlement));
  }

  @Get(":payout_id")
  async get(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("payout_id") payoutId: string,
  ) {
    const found = findByPayoutId(payoutId);
    if (!found) {
      throw new NotFoundException(
        `No stellar settlement for payout_id ${payoutId}`,
      );
    }
    const row = publicSettlement(found);
    let reconcile = null;
    if (row.stellar_tx_hash) {
      reconcile = await reconcileTransaction(row.stellar_tx_hash);
    }
    const threeWay = await reconcileThreeWay(payoutId);
    if (prefersHtml(req)) {
      res.type("html");
      return renderPayoutPage({ row, reconcile, threeWay });
    }
    return {
      payout_id: row.payout_id,
      organization_id: row.organization_id,
      environment: row.environment,
      status: row.status,
      amount: row.amount,
      currency_code: row.currency_code,
      amount_usdc: row.amount_usdc,
      stellar_tx_hash: row.stellar_tx_hash,
      bridge_transfer_id: row.bridge_transfer_id,
      last_mile_rail: row.last_mile_rail,
      destination: row.destination,
      memo: row.memo,
      created_at: row.created_at,
      updated_at: row.updated_at,
      reconcile,
      three_way: threeWay,
      settlement: row,
    };
  }
}
