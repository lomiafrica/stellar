import { Body, Controller, Get, Header, Param, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { dispatchLastMile, type LastMileRail } from '../anchor/last-mile.js';
import { PUBLIC_BASE_URL } from '../config.js';

/**
 * Callback surface for official Anchor Platform on testnet.
 * SEP-10/12/24 servers stay in the platform container. This app only
 * does last-mile adapters and a tiny interactive SEP-24 page.
 */
@Controller('anchor')
export class AnchorController {
  @Get()
  info() {
    return {
      sep1: `${PUBLIC_BASE_URL}/.well-known/stellar.toml`,
      sep10: `${PUBLIC_BASE_URL}/anchor/sep10`,
      sep12: `${PUBLIC_BASE_URL}/anchor/sep12`,
      sep24: `${PUBLIC_BASE_URL}/anchor/sep24`,
      last_mile: ['wave', 'mtn', 'spi'],
    };
  }

  @Post('sep12/customer')
  sep12Customer(
    @Body()
    body: { account?: string; type?: string },
  ) {
    return {
      id: body.account ?? randomUUID(),
      status: 'ACCEPTED',
      message: 'Lab SEP-12 stub. Production uses existing merchant verification.',
      type: body.type ?? 'sep31-receiver',
    };
  }

  @Get('sep24/:kind')
  @Header('Content-Type', 'text/html; charset=utf-8')
  sep24Page(@Param('kind') kind: string): string {
    const title = kind === 'withdraw' ? 'Withdraw XOF' : 'Deposit XOF';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>Testnet interactive SEP-24. Last mile is Wave / MTN / SPI sandbox.</p><form method="post" action="/anchor/sep24/${kind}"><button type="submit">Complete sandbox ${kind}</button></form></body></html>`;
  }

  @Post('sep24/:kind')
  sep24Complete(
    @Param('kind') kind: string,
    @Body()
    body: { amount?: string; phone?: string; rail?: LastMileRail },
  ) {
    const payoutId = randomUUID();
    const lastMile = dispatchLastMile({
      rail: body.rail ?? 'wave',
      amountXof: body.amount ?? '1000',
      phone: body.phone ?? '+2250700000000',
      payoutId,
      kind: kind === 'withdraw' ? 'withdraw' : 'deposit',
    });
    return {
      id: payoutId,
      status: 'pending_user_transfer_start',
      kind: lastMile.kind,
      last_mile: lastMile,
    };
  }

  @Post('last-mile/:rail')
  lastMile(
    @Param('rail') rail: string,
    @Body()
    body: {
      amount_xof?: string;
      phone?: string;
      payout_id?: string;
      kind?: 'deposit' | 'withdraw';
    },
  ) {
    const resolved: LastMileRail =
      rail === 'mtn' || rail === 'spi' ? rail : 'wave';
    return dispatchLastMile({
      rail: resolved,
      amountXof: body.amount_xof ?? '1000',
      phone: body.phone ?? '+2250700000000',
      payoutId: body.payout_id ?? randomUUID(),
      kind: body.kind ?? 'withdraw',
    });
  }
}
