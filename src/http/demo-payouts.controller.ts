import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
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
  acceptStellarPayout,
  createStellarPayout,
  notReadyBody,
} from "../payouts/stellar-payout.service.js";
import { enqueuePayout } from "../payouts/worker.js";
import {
  DualControlError,
  PayoutCapError,
  PayoutInFlightError,
} from "../payouts/errors.js";
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
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
      async?: boolean;
    },
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-lab-key") labKey?: string,
    @Headers("x-lab-approval") labApproval?: string,
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
      approval: labApproval,
    };

    const wantsAsync =
      body.async === true ||
      String(req.headers.prefer ?? "").toLowerCase().includes("respond-async");

    try {
      if (wantsAsync) {
        const payoutId = input.payout_id ?? randomUUID();
        const accepted = await acceptStellarPayout({
          payoutId,
          amount: input.amount_usdc,
          amount_number: input.amount,
          currency_code: input.currency_code,
          organization_id: input.organization_id,
          destination: input.destination,
          last_mile_rail: input.last_mile_rail ?? "wave",
          phone: input.phone,
          bridge_transfer_id: input.bridge_transfer_id,
          approval: input.approval,
        });
        if (!accepted.replay) {
          enqueuePayout({ ...input, payout_id: accepted.payoutId });
        }
        if (accepted.status !== "completed") res.status(202);
        const acceptedBody = {
          success: true,
          payout_id: accepted.payoutId,
          kind:
            input.destination === "beneficiary"
              ? ("beneficiary" as const)
              : ("withdrawal" as const),
          status: accepted.status,
          message: accepted.replay
            ? "Idempotent replay: existing stellar settlement."
            : "Accepted. Settlement continues in the background.",
          stellar_tx_hash: accepted.stellarTransactionId,
          stellar_transaction_id: accepted.stellarTransactionId,
        };
        if (idempotencyKey) {
          saveIdempotentResponse(
            idempotencyKey,
            accepted.payoutId,
            acceptedBody,
          );
        }
        return acceptedBody;
      }
      const response = await createStellarPayout(input);
      if (idempotencyKey) {
        saveIdempotentResponse(idempotencyKey, response.payout_id, response);
      }
      return response;
    } catch (err) {
      if (err instanceof SettleNotReadyError) {
        throw new BadRequestException(notReadyBody(err));
      }
      if (err instanceof DualControlError) {
        throw new BadRequestException({
          success: false,
          reason: "dual_control",
          message: err.message,
        });
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
  list(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("since") since?: string,
  ) {
    const cutoff = since ? Date.parse(since) : Number.NaN;
    const rows = readLedger()
      .map(publicSettlement)
      .filter((row) => {
        if (!Number.isFinite(cutoff)) return true;
        const created = Date.parse(row.created_at);
        return Number.isFinite(created) && created >= cutoff;
      });
    if (prefersHtml(req)) {
      res.type("html");
      return renderPayoutListPage(rows);
    }
    return {
      payouts: rows.map((row) => ({
        payout_id: row.payout_id,
        status: row.status,
        stellar_tx_hash: row.stellar_tx_hash ?? "",
        stellar_transaction_id: row.stellar_tx_hash ?? "",
        created_at: row.created_at,
      })),
    };
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
      stellar_transaction_id: row.stellar_tx_hash,
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
