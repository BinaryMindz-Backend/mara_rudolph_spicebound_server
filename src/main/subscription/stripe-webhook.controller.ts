import {
  Controller,
  Get,
  Post,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { SubscriptionService } from './subscription.service.js';

@Controller('stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * GET /stripe/webhook - Use this to verify the webhook URL is reachable.
   * In Stripe Dashboard → Webhooks, the endpoint URL must be exactly this URL (POST is used by Stripe).
   */
  @Get('webhook')
  webhookInfo() {
    // Use public API URL for webhook (mara-server: api.readspicebound.com)
    const base =
      this.configService.get<string>('PUBLIC_API_URL') ||
      this.configService.get<string>('API_URL') ||
      'https://api.readspicebound.com';
    const webhookUrl = `${base.replace(/\/$/, '')}/stripe/webhook`;
    return {
      message: 'Stripe webhooks must use POST. This URL is for endpoint verification.',
      webhookUrl,
      stripeDashboard: 'https://dashboard.stripe.com/webhooks',
    };
  }

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

    this.logger.log(
      '[WEBHOOK] Body is Buffer:',
      Buffer.isBuffer(rawBody),
      'Type:',
      typeof rawBody,
    );
    this.logger.log('[WEBHOOK] Processing webhook event...');

    await this.subscriptionService.handleWebhook(buffer, signature);

    this.logger.log('[WEBHOOK] Webhook processed successfully');
    return { received: true };
  }
}
