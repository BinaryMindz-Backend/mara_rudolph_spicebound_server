import {
  Controller,
  Post,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { SubscriptionService } from './subscription.service.js';


@Controller('stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Post('webhook')
  async handleWebhook(@Req() req: Request) {
    this.logger.log('[WEBHOOK] POST /stripe/webhook received');
    
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      this.logger.error('[WEBHOOK] Missing Stripe signature header');
      throw new BadRequestException('Missing Stripe signature header');
    }

    // Raw body is now available from body-parser middleware
    const rawBody = req.body;

    if (!rawBody) {
      this.logger.error('[WEBHOOK] Request body is empty');
      throw new BadRequestException('Request body is empty');
    }

    // Convert to Buffer if it's not already
    const buffer = Buffer.isBuffer(rawBody) 
      ? rawBody 
      : Buffer.from(JSON.stringify(rawBody));

    this.logger.log('[WEBHOOK] Body is Buffer:', Buffer.isBuffer(rawBody), 'Type:', typeof rawBody);
    this.logger.log('[WEBHOOK] Processing webhook event...');
    
    await this.subscriptionService.handleWebhook(buffer, signature);
    
    this.logger.log('[WEBHOOK] Webhook processed successfully');
    return { received: true };
  }
}
