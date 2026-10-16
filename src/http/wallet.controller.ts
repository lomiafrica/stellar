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
} from "@nestjs/common";
import { getStellarNetwork } from "../config.js";
import { getKeysDir } from "../paths.js";
import type { JsonObject } from "../json.js";
import { assertLabMutatingAuth } from "./lab-auth.js";
import {
  beginWalletIdempotency,
  cancelWalletIdempotency,
  saveWalletIdempotency,
} from "../wallet/idempotency.js";
import { createHorizonWalletChain } from "../wallet/horizon.js";
import {
  ensureWalletAccount,
  listWalletPayments,
  submitWalletPayment,
} from "../wallet/service.js";

function walletNetwork(): "testnet" | "public" {
  return getStellarNetwork();
}

@Controller("wallet")
export class WalletController {
  @Post("accounts")
  async createAccount(
    @Body() body: { organization_id?: string },
    @Headers("x-lab-key") labKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    assertLabMutatingAuth(labKey, authorization);
    const organizationId = body.organization_id?.trim() ?? "";
    if (!organizationId) {
      throw new BadRequestException("organization_id is required");
    }
    try {
      const account = await ensureWalletAccount({
        organizationId,
        keysDir: getKeysDir(),
        network: walletNetwork(),
        chain: createHorizonWalletChain(),
      });
      return { public_key: account.publicKey, created: account.created };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : "wallet account failed",
      );
    }
  }

  @Get("accounts/:organizationId")
  async getAccount(
    @Param("organizationId") organizationId: string,
    @Headers("x-lab-key") labKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    assertLabMutatingAuth(labKey, authorization);
    try {
      const listed = await listWalletPayments({
        organizationId,
        keysDir: getKeysDir(),
        network: walletNetwork(),
        chain: createHorizonWalletChain(),
      });
      return { public_key: listed.publicKey };
    } catch (err) {
      const message = err instanceof Error ? err.message : "wallet missing";
      if (message.includes("not created")) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
  }

  @Get("accounts/:organizationId/payments")
  async listPayments(
    @Param("organizationId") organizationId: string,
    @Headers("x-lab-key") labKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    assertLabMutatingAuth(labKey, authorization);
    try {
      const listed = await listWalletPayments({
        organizationId,
        keysDir: getKeysDir(),
        network: walletNetwork(),
        chain: createHorizonWalletChain(),
      });
      return {
        public_key: listed.publicKey,
        payments: listed.payments.map((payment) => ({
          hash: payment.hash,
          amount: payment.amount,
          from: payment.from,
          to: payment.to,
          memo: payment.memo,
          asset_code: payment.assetCode,
          direction: payment.direction,
        })),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "wallet missing";
      if (message.includes("not created")) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
  }

  @Post("payments")
  async submitPayment(
    @Body()
    body: {
      organization_id?: string;
      destination?: string;
      amount?: string;
      memo?: string;
    },
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-lab-key") labKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    assertLabMutatingAuth(labKey, authorization);
    const key = idempotencyKey?.trim() || randomUUID();
    const begun = beginWalletIdempotency(key);
    if (begun.kind === "hit") return begun.body;
    if (begun.kind === "busy") {
      throw new ConflictException({
        success: false,
        reason: "idempotency key in flight",
      });
    }
    try {
      const payment = await submitWalletPayment({
        organizationId: body.organization_id?.trim() ?? "",
        keysDir: getKeysDir(),
        network: walletNetwork(),
        chain: createHorizonWalletChain(),
        destination: body.destination?.trim() ?? "",
        amount: body.amount?.trim() ?? "",
        memo: body.memo?.trim() ?? "",
      });
      const response: JsonObject = {
        hash: payment.hash,
        amount: payment.amount,
        from: payment.from,
        to: payment.to,
        memo: payment.memo,
      };
      saveWalletIdempotency(key, response);
      return response;
    } catch (err) {
      cancelWalletIdempotency(key);
      throw new BadRequestException(
        err instanceof Error ? err.message : "wallet payment failed",
      );
    }
  }
}
