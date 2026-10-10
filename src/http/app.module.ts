import { Module } from "@nestjs/common";
import { AnchorController } from "./anchor.controller.js";
import { BridgeWebhookController } from "./bridge-webhook.controller.js";
import { DemoPayoutsController } from "./demo-payouts.controller.js";
import { MockBridgeController } from "./mock-bridge.controller.js";
import { OpsController } from "./ops.controller.js";
import { SettleController } from "./settle.controller.js";
import { TomlController } from "./toml.controller.js";

@Module({
  controllers: [
    DemoPayoutsController,
    SettleController,
    TomlController,
    MockBridgeController,
    BridgeWebhookController,
    AnchorController,
    OpsController,
  ],
})
export class AppModule {}
