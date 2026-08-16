import { Module } from '@nestjs/common';
import { DemoPayoutsController } from './demo-payouts.controller.js';
import { MockBridgeController } from './mock-bridge.controller.js';
import { SettleController } from './settle.controller.js';
import { TomlController } from './toml.controller.js';

@Module({
  controllers: [
    DemoPayoutsController,
    SettleController,
    TomlController,
    MockBridgeController,
  ],
})
export class AppModule {}
