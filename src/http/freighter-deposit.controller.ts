import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { dispatchLastMile, type LastMileRail } from "../anchor/last-mile.js";
import { patchPlatformTransaction } from "../anchor/platform-patch.js";
import { depositPage } from "./deposit-page.js";
import { isJsonObject, parseJson, readString } from "../json.js";

type DepositBody = {
  token?: string;
  url?: string;
  transaction?: string;
};

function readDepositBody(text: string): DepositBody {
  try {
    const parsed = parseJson(text);
    if (!isJsonObject(parsed)) return {};
    return {
      token: readString(parsed, "token"),
      url: readString(parsed, "url"),
      transaction: readString(parsed, "transaction"),
    };
  } catch {
    return {};
  }
}

const HOME = "lomi.africa";

function anchorBase(): string {
  return (
    process.env.ANCHOR_PUBLIC_URL?.trim() ||
    "https://anchor-production-5059.up.railway.app"
  ).replace(/\/$/, "");
}

function isAccount(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value);
}

function isRail(value: string): value is LastMileRail {
  return value === "wave" || value === "mtn" || value === "spi";
}

async function readJson(response: Response): Promise<{
  status: number;
  body: { token?: string; url?: string; transaction?: string };
  text: string;
}> {
  const text = await response.text();
  return { status: response.status, body: readDepositBody(text), text };
}

@Controller("deposit")
export class FreighterDepositController {
  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  page(): string {
    return depositPage;
  }

  @Get("challenge")
  async challenge(
    @Query("account") account = "",
  ): Promise<{ transaction?: string }> {
    if (!isAccount(account)) {
      throw new BadRequestException("Account is not a Stellar address");
    }
    const response = await fetch(
      `${anchorBase()}/auth?account=${encodeURIComponent(account)}&home_domain=${HOME}`,
    );
    const result = await readJson(response);
    if (!result.body.transaction) {
      throw new BadRequestException("Login challenge failed");
    }
    return { transaction: result.body.transaction };
  }

  @Post("start")
  async start(
    @Body() body: { account?: string; transaction?: string },
  ): Promise<{ token: string; transactionId: string }> {
    const account = body.account?.trim() ?? "";
    const transaction = body.transaction?.trim() ?? "";
    if (!isAccount(account) || !transaction) {
      throw new BadRequestException("Login is incomplete");
    }
    const tokenRes = await fetch(`${anchorBase()}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction }),
    });
    const tokenBody = await readJson(tokenRes);
    const token = tokenBody.body.token ?? "";
    if (!token) {
      throw new BadRequestException("Login was not accepted");
    }
    const auth = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    await fetch(`${anchorBase()}/sep12/customer`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({
        account,
        email_address: "sandbox@example.test",
      }),
    });
    const interactive = await fetch(
      `${anchorBase()}/sep24/transactions/deposit/interactive`,
      {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ asset_code: "XOF", account, amount: "1000" }),
      },
    );
    const row = await readJson(interactive);
    const url = row.body.url ?? "";
    if (!url) {
      throw new BadRequestException("Deposit did not open");
    }
    const parsed = new URL(url);
    return {
      token: parsed.searchParams.get("token") ?? "",
      transactionId:
        parsed.searchParams.get("transaction_id") ??
        parsed.searchParams.get("id") ??
        "",
    };
  }

  @Post("complete")
  async complete(
    @Body()
    body: {
      amount?: string;
      phone?: string;
      rail?: string;
      transaction_id?: string;
    },
  ) {
    const rail = body.rail ?? "wave";
    if (!isRail(rail)) {
      throw new BadRequestException("Rail is not Wave, MTN, or SPI");
    }
    const payoutId = body.transaction_id?.trim() || randomUUID();
    const lastMile = dispatchLastMile({
      rail,
      amountXof: body.amount ?? "1000",
      phone: body.phone ?? "+2250700000000",
      payoutId,
      kind: "deposit",
    });
    if (body.transaction_id) {
      await patchPlatformTransaction({
        transactionId: payoutId,
        status: "completed",
        message: lastMile.message,
      });
    }
    return { last_mile: lastMile };
  }
}
