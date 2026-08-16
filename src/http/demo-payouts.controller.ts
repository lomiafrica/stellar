import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  getIdempotentResponse,
  saveIdempotentResponse,
} from '../ledger/idempotency.js';
import { findByPayoutId } from '../ledger/store.js';
import { reconcileTransaction } from '../ledger/reconcile.js';
import { createStellarPayout } from '../payouts/stellar-payout.service.js';
import type { CreateStellarPayoutInput } from '../payouts/types.js';
import type { JsonObject } from '../json.js';

@Controller('demo/payouts')
export class DemoPayoutsController {
  @Post()
  async create(
    @Body()
    body: {
      destination: 'self' | 'beneficiary';
      rail: 'stellar';
      amount: number;
      currency_code: string;
      payout_id?: string;
      organization_id?: string;
      last_mile_rail?: 'wave' | 'mtn' | 'spi' | 'bank';
      payout_method_id?: string;
      recipient?: { name: string; phone: string };
      reason?: string;
      metadata?: JsonObject;
      amount_usdc?: string;
    },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (body.rail !== 'stellar') {
      return {
        success: false,
        message: 'This demo only supports rail=stellar.',
      };
    }

    if (idempotencyKey) {
      const cached = getIdempotentResponse(idempotencyKey);
      if (cached) return cached;
    }

    const input: CreateStellarPayoutInput = {
      destination: body.destination,
      rail: 'stellar',
      amount: body.amount,
      currency_code: body.currency_code,
      payout_id: body.payout_id,
      organization_id: body.organization_id,
      last_mile_rail: body.last_mile_rail,
      payout_method_id: body.payout_method_id,
      recipient: body.recipient,
      reason: body.reason,
      metadata: body.metadata,
      amount_usdc: body.amount_usdc,
      phone: body.recipient?.phone,
    };

    const response = await createStellarPayout(input);
    if (idempotencyKey) {
      saveIdempotentResponse(idempotencyKey, response.payout_id, response);
    }
    return response;
  }

  @Get(':payout_id')
  async get(@Param('payout_id') payoutId: string) {
    const row = findByPayoutId(payoutId);
    if (!row) {
      throw new NotFoundException(`No stellar settlement for payout_id ${payoutId}`);
    }
    let reconcile = null;
    if (row.stellar_tx_hash) {
      reconcile = await reconcileTransaction(row.stellar_tx_hash);
    }
    return {
      payout_id: row.payout_id,
      organization_id: row.organization_id,
      environment: row.environment,
      status: row.status,
      amount: row.amount,
      currency_code: row.currency_code,
      amount_usdc: row.amount_usdc,
      stellar_tx_hash: row.stellar_tx_hash,
      bridge_transfer_id: row.bridge_transfer_id,
      last_mile_rail: row.last_mile_rail,
      destination: row.destination,
      memo: row.memo,
      created_at: row.created_at,
      updated_at: row.updated_at,
      reconcile,
      settlement: row,
    };
  }
}
