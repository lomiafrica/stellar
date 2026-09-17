import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { PUBLIC_BASE_URL } from "../config.js";
import {
  callbackAuthOk,
  toCallbackCustomer,
} from "../anchor/callback-customer.js";
import {
  readJwtDataString,
  readJwtString,
  verifyHs256Jwt,
} from "../anchor/jwt.js";
import {
  dispatchLastMile,
  getLastMileCredit,
  type LastMileRail,
} from "../anchor/last-mile.js";
import {
  readSep12PutEmail,
  upsertSep12Customer,
  verifySep12Customer,
} from "../anchor/merchant-verify.js";
import { patchPlatformTransaction } from "../anchor/platform-patch.js";
import {
  renderSep24CreditReceipt,
  renderSep24FlowPage,
  renderSep24Interactive,
  renderSep24MoreInfo,
} from "../anchor/sep24-pages.js";
import { prefersHtml } from "./page-chrome.js";
import { isPublicDeploy } from "./lab-auth.js";
import { createSep6Transfer } from "../anchor/sep6.js";
import { recordSep31Inbound } from "../anchor/sep31.js";
import {
  assertQuoteUsable,
  createSep38Quote,
  getSep38Quote,
} from "../anchor/sep38.js";

function sep24JwtSecret(): string {
  return (
    process.env.SEP24_INTERACTIVE_URL_JWT_SECRET?.trim() ??
    process.env.SECRET_SEP24_INTERACTIVE_URL_JWT_SECRET?.trim() ??
    ""
  );
}

function wantsJson(req: Request): boolean {
  const type = String(req.headers["content-type"] ?? "");
  return type.includes("application/json");
}

function decodeSep24Token(token?: string): {
  account?: string;
  transactionId?: string;
  amount?: string;
} {
  const secret = sep24JwtSecret();
  if (!token || !secret) return {};
  const payload = verifyHs256Jwt(token, secret);
  if (!payload) return {};
  return {
    account: readJwtString(payload, "sub"),
    transactionId:
      readJwtDataString(payload, "transaction_id") ??
      readJwtString(payload, "jti"),
    amount: readJwtDataString(payload, "amount"),
  };
}

function assertSep24MutatingAuth(token?: string): void {
  const secret = sep24JwtSecret();
  if (isPublicDeploy()) {
    if (!secret) {
      throw new ServiceUnavailableException({
        success: false,
        reason: "SEP24_INTERACTIVE_URL_JWT_SECRET unset",
      });
    }
    if (!token || !verifyHs256Jwt(token, secret)) {
      throw new UnauthorizedException("SEP-24 token required");
    }
    return;
  }
  if (token && secret && !verifyHs256Jwt(token, secret)) {
    throw new UnauthorizedException("Invalid SEP-24 token");
  }
}

/**
 * Callback surface for official Anchor Platform on testnet.
 * SEP-10 signing stays in the platform container (SEP10_SIGNING_SEED from env).
 * This app does merchant SEP-12, interactive SEP-24, SEP-6/38, and last mile.
 */
@Controller("anchor")
export class AnchorController {
  @Get()
  info() {
    return {
      sep1: `${PUBLIC_BASE_URL}/.well-known/stellar.toml`,
      sep6: `${PUBLIC_BASE_URL}/anchor/sep6`,
      sep10:
        process.env.WEB_AUTH_ENDPOINT?.replace(/\/$/, "") ??
        `${PUBLIC_BASE_URL}/anchor/sep10`,
      sep12: `${PUBLIC_BASE_URL}/anchor/sep12`,
      sep24: `${PUBLIC_BASE_URL}/anchor/sep24`,
      sep31: `${PUBLIC_BASE_URL}/anchor/sep31`,
      sep38: `${PUBLIC_BASE_URL}/anchor/sep38`,
      last_mile: ["wave", "mtn", "spi"],
    };
  }

  @Get("customer")
  async callbackCustomerGet(
    @Headers("x-api-key") apiKey: string | undefined,
    @Headers("authorization") authorization: string | undefined,
    @Query("account") account?: string,
    @Query("id") id?: string,
    @Query("type") type?: string,
  ) {
    if (!callbackAuthOk(apiKey, authorization)) {
      throw new UnauthorizedException("Callback API key required");
    }
    const customer = await verifySep12Customer({
      account: account ?? id,
      type: type ?? "sep24",
    });
    return toCallbackCustomer(customer);
  }

  @Put("customer")
  async callbackCustomerPut(
    @Headers("x-api-key") apiKey: string | undefined,
    @Headers("authorization") authorization: string | undefined,
    @Body()
    body: {
      account?: string;
      id?: string;
      type?: string;
      email?: string;
      email_address?: string;
      fields?: Record<string, unknown>;
    },
  ) {
    if (!callbackAuthOk(apiKey, authorization)) {
      throw new UnauthorizedException("Callback API key required");
    }
    const customer = await upsertSep12Customer({
      account: body.account ?? body.id,
      type: body.type ?? "sep24",
      email: readSep12PutEmail(body),
    });
    return toCallbackCustomer(customer);
  }

  @Post("sep12/customer")
  async sep12Customer(
    @Body()
    body: {
      account?: string;
      type?: string;
    },
  ) {
    return verifySep12Customer({
      account: body.account,
      type: body.type,
    });
  }

  @Get("sep12/customer")
  async sep12Get(@Query("account") account?: string) {
    return verifySep12Customer({ account, type: "sep24" });
  }

  @Get("sep24/credit/:id")
  sep24Credit(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id") id: string,
  ) {
    const safeId = id.replace(/[^\w-]/g, "");
    const credit = getLastMileCredit(safeId);
    if (!credit) {
      throw new NotFoundException("Sandbox credit not found");
    }
    if (prefersHtml(req)) {
      res.type("html");
      return renderSep24CreditReceipt(credit);
    }
    return credit;
  }

  @Get("sep24/:kind")
  @Header("Content-Type", "text/html; charset=utf-8")
  sep24Page(
    @Param("kind") kind: string,
    @Query("token") token?: string,
    @Query("transaction_id") transactionId?: string,
  ): string {
    if (kind === "flow") {
      return renderSep24FlowPage();
    }
    if (kind === "more_info") {
      const decoded = decodeSep24Token(token);
      const id = (decoded.transactionId ?? transactionId ?? "").replace(
        /[^\w-]/g,
        "",
      );
      return renderSep24MoreInfo(id);
    }
    const decoded = decodeSep24Token(token);
    if (kind === "interactive" && sep24JwtSecret() && !token) {
      throw new BadRequestException("SEP-24 token required");
    }
    if (token && sep24JwtSecret() && !verifyHs256Jwt(token, sep24JwtSecret())) {
      throw new UnauthorizedException("Invalid SEP-24 token");
    }
    const action = kind === "withdraw" ? "withdraw" : "deposit";
    const amount = decoded.amount ?? "1000";
    const tx = decoded.transactionId ?? transactionId ?? "";
    const safeToken = (token ?? "").replace(/[^A-Za-z0-9._=-]/g, "");
    const safeTx = tx.replace(/[^\w-]/g, "");
    const safeAmount = /^\d+(\.\d+)?$/.test(amount) ? amount : "1000";
    return renderSep24Interactive({
      kind: action,
      amount: safeAmount,
      token: safeToken,
      transactionId: safeTx,
    });
  }

  @Post("sep24/:kind")
  async sep24Complete(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("kind") kind: string,
    @Body()
    body: {
      amount?: string;
      phone?: string;
      rail?: LastMileRail;
      token?: string;
      transaction_id?: string;
    },
  ) {
    assertSep24MutatingAuth(body.token);
    const decoded = decodeSep24Token(body.token);
    const payoutId = decoded.transactionId ?? body.transaction_id ?? randomUUID();
    const lastMile = dispatchLastMile({
      rail: body.rail ?? "wave",
      amountXof: body.amount ?? decoded.amount ?? "1000",
      phone: body.phone ?? "+2250700000000",
      payoutId,
      kind: kind === "withdraw" ? "withdraw" : "deposit",
    });
    let platform: { ok: boolean; detail: string } | undefined;
    if (decoded.transactionId ?? body.transaction_id) {
      platform = await patchPlatformTransaction({
        transactionId: payoutId,
        status: "completed",
        message: lastMile.message,
      });
    }
    if (wantsJson(req)) {
      return {
        id: payoutId,
        status: lastMile.status,
        kind: lastMile.kind,
        last_mile: lastMile,
        platform,
      };
    }
    res.type("html");
    return renderSep24CreditReceipt(lastMile);
  }

  @Post("sep6/:kind")
  sep6(
    @Param("kind") kind: string,
    @Body()
    body: {
      amount?: string;
      asset?: string;
      phone?: string;
      rail?: LastMileRail;
      quote_id?: string;
    },
  ) {
    try {
      return createSep6Transfer({
        kind: kind === "withdraw" ? "withdraw" : "deposit",
        amount: body.amount ?? "1000",
        asset: body.asset,
        phone: body.phone,
        rail: body.rail,
        quoteId: body.quote_id,
      });
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : "SEP-6 failed",
      );
    }
  }

  @Get("sep38/price")
  sep38Price(
    @Query("sell_asset") sellAsset?: string,
    @Query("buy_asset") buyAsset?: string,
  ) {
    const quote = createSep38Quote({
      sellAsset: sellAsset ?? "iso4217:XOF",
      buyAsset: buyAsset ?? "stellar:USDC",
      sellAmount: "65596",
      ttlSeconds: 1,
    });
    return {
      price: quote.price,
      sell_asset: quote.sellAsset,
      buy_asset: quote.buyAsset,
    };
  }

  @Post("sep38/quote")
  sep38Quote(
    @Body()
    body: {
      sell_asset?: string;
      buy_asset?: string;
      sell_amount?: string;
      buy_amount?: string;
      ttl_seconds?: number;
    },
  ) {
    try {
      const quote = createSep38Quote({
        sellAsset: body.sell_asset ?? "iso4217:XOF",
        buyAsset: body.buy_asset ?? "stellar:USDC",
        sellAmount: body.sell_amount,
        buyAmount: body.buy_amount,
        ttlSeconds: body.ttl_seconds,
      });
      return {
        id: quote.id,
        sell_asset: quote.sellAsset,
        buy_asset: quote.buyAsset,
        sell_amount: quote.sellAmount,
        buy_amount: quote.buyAmount,
        price: quote.price,
        expires_at: quote.expiresAt,
      };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : "SEP-38 quote failed",
      );
    }
  }

  @Get("sep38/quote/:id")
  sep38Get(@Param("id") id: string) {
    const quote = getSep38Quote(id);
    if (!quote) {
      throw new BadRequestException("Unknown quote_id");
    }
    try {
      assertQuoteUsable(id);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : "Quote expired",
      );
    }
    return quote;
  }

  @Post("sep31/receive")
  sep31Receive(
    @Body()
    body: {
      sending_anchor?: string;
      amount?: string;
      stellar_tx_hash?: string;
      phone?: string;
      rail?: LastMileRail;
    },
  ) {
    try {
      return recordSep31Inbound({
        sendingAnchor: body.sending_anchor ?? "external",
        amount: body.amount ?? "1000",
        stellarTxHash: body.stellar_tx_hash ?? "",
        phone: body.phone,
        rail: body.rail,
      });
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : "SEP-31 receive failed",
      );
    }
  }

  @Post("last-mile/:rail")
  lastMile(
    @Param("rail") rail: string,
    @Body()
    body: {
      amount_xof?: string;
      phone?: string;
      payout_id?: string;
      kind?: "deposit" | "withdraw";
    },
  ) {
    assertSep24MutatingAuth();
    const resolved: LastMileRail =
      rail === "mtn" || rail === "spi" ? rail : "wave";
    return dispatchLastMile({
      rail: resolved,
      amountXof: body.amount_xof ?? "1000",
      phone: body.phone ?? "+2250700000000",
      payoutId: body.payout_id ?? randomUUID(),
      kind: body.kind ?? "withdraw",
    });
  }
}
