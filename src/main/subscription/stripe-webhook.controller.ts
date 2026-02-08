import {
  Controller,
  Post,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SubscriptionService } from './subscription.service.js';


@Controller('stripe')
export class StripeWebhookController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Post('webhook')
  async handleWebhook(@Req() req: Request) {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      throw new BadRequestException('Missing Stripe signature header');
    }

    // Raw body is now available from body-parser middleware
    const rawBody = req.body;

    if (!rawBody) {
      throw new BadRequestException('Request body is empty');
    }

    // Convert to Buffer if it's not already
    const buffer = Buffer.isBuffer(rawBody) 
      ? rawBody 
      : Buffer.from(JSON.stringify(rawBody));

  console.log('[WEBHOOK] Body is Buffer:', Buffer.isBuffer(rawBody), 'Type:', typeof rawBody);
  await this.subscriptionService.handleWebhook(buffer, signature);

    return { received: true };
  }
}
