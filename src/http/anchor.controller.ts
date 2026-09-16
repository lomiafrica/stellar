import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
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
import { dispatchLastMile, type LastMileRail } from "../anchor/last-mile.js";
import { verifySep12Customer } from "../anchor/merchant-verify.js";
import { patchPlatformTransaction } from "../anchor/platform-patch.js";
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
    },
  ) {
    if (!callbackAuthOk(apiKey, authorization)) {
      throw new UnauthorizedException("Callback API key required");
    }
    const customer = await verifySep12Customer({
      account: body.account ?? body.id,
      type: body.type ?? "sep24",
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

  @Get("sep24/:kind")
  @Header("Content-Type", "text/html; charset=utf-8")
  sep24Page(
    @Param("kind") kind: string,
    @Query("token") token?: string,
    @Query("transaction_id") transactionId?: string,
  ): string {
    if (kind === "more_info") {
      const decoded = decodeSep24Token(token);
      const id = (decoded.transactionId ?? transactionId ?? "").replace(
        /[^\w-]/g,
        "",
      );
      return `<!doctype html><html lang="en"><body>
<h1>SEP-24 more info</h1>
<p>transaction_id=${id}</p>
<p>Sandbox last mile only. No live mobile money.</p>
</body></html>`;
    }
    const decoded = decodeSep24Token(token);
    if (kind === "interactive" && sep24JwtSecret() && !token) {
      throw new BadRequestException("SEP-24 token required");
    }
    if (token && sep24JwtSecret() && !verifyHs256Jwt(token, sep24JwtSecret())) {
      throw new UnauthorizedException("Invalid SEP-24 token");
    }
    const action = kind === "withdraw" ? "withdraw" : "deposit";
    const title = action === "withdraw" ? "Withdraw XOF" : "Deposit XOF";
    const amount = decoded.amount ?? "1000";
    const tx = decoded.transactionId ?? transactionId ?? "";
    const safeToken = (token ?? "").replace(/[^\w.-=]/g, "");
    const safeTx = tx.replace(/[^\w-]/g, "");
    const safeAmount = /^\d+(\.\d+)?$/.test(amount) ? amount : "1000";
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; color: #111; }
    label { display: block; margin: 0.75rem 0 0.25rem; font-size: 0.875rem; }
    input, select { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
    button { margin-top: 1rem; width: 100%; padding: 0.65rem; border: 0; border-radius: 4px; background: #111; color: #fff; }
    p { color: #555; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>Testnet SEP-24. Completing this form credits Wave, MTN, or SPI sandbox only. No live mobile money.</p>
  <form method="post" action="/anchor/sep24/${action}">
    <input type="hidden" name="token" value="${safeToken}">
    <input type="hidden" name="transaction_id" value="${safeTx}">
    <label for="amount">Amount (XOF)</label>
    <input id="amount" name="amount" type="number" min="100" value="${safeAmount}" required>
    <label for="phone">Phone</label>
    <input id="phone" name="phone" type="tel" value="+2250700000000" required>
    <label for="rail">Last mile</label>
    <select id="rail" name="rail">
      <option value="wave">Wave sandbox</option>
      <option value="mtn">MTN sandbox</option>
      <option value="spi">SPI sandbox</option>
    </select>
    <button type="submit">Complete sandbox ${action}</button>
  </form>
</body>
</html>`;
  }

  @Post("sep24/:kind")
  async sep24Complete(
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
    if (
      body.token &&
      sep24JwtSecret() &&
      !verifyHs256Jwt(body.token, sep24JwtSecret())
    ) {
      throw new UnauthorizedException("Invalid SEP-24 token");
    }
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
    return {
      id: payoutId,
      status: "pending_user_transfer_start",
      kind: lastMile.kind,
      last_mile: lastMile,
      platform,
    };
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
