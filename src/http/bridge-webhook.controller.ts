import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
  ServiceUnavailableException,
  type RawBodyRequest,
} from "@nestjs/common";
import type { Request } from "express";
import { handleBridgeWebhook } from "../bridge/webhook-handler.js";

@Controller("bridge")
export class BridgeWebhookController {
  @Post("webhook")
  receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-webhook-signature") signature: string | undefined,
  ) {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException({ ok: false, reason: "missing raw body" });
    }
    const result = handleBridgeWebhook(raw.toString("utf8"), signature);
    if (result.status === 503) {
      throw new ServiceUnavailableException(result.body);
    }
    if (result.status === 400) {
      throw new BadRequestException(result.body);
    }
    return result.body;
  }
}
