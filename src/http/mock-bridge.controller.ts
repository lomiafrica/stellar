import { Body, Controller, Headers, Post } from "@nestjs/common";
import { mockBridgeUsdToUsdc } from "../mock/bridge.js";
import { assertLabMutatingAuth } from "./lab-auth.js";

@Controller("mock/bridge")
export class MockBridgeController {
  @Post("fund")
  fund(
    @Body() body: { usd_amount?: string },
    @Headers("x-lab-key") labKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    assertLabMutatingAuth(labKey, authorization);
    const usd = body.usd_amount ?? "10";
    return mockBridgeUsdToUsdc(usd);
  }
}
