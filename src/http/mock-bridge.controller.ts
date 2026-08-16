import { Body, Controller, Post } from '@nestjs/common';
import { mockBridgeUsdToUsdc } from '../mock/bridge.js';

@Controller('mock/bridge')
export class MockBridgeController {
  @Post('fund')
  fund(@Body() body: { usd_amount?: string }) {
    const usd = body.usd_amount ?? '10';
    return mockBridgeUsdToUsdc(usd);
  }
}
