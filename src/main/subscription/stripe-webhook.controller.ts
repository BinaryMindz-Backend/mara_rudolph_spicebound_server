import {
  Controller,
  Get,
  Post,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { SubscriptionService } from './subscription.service.js';

@ApiTags('Stripe Webhook')
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
  @ApiOperation({
    summary: 'Webhook URL verification',
    description:
      'Returns the webhook URL and Stripe Dashboard link. Use this to confirm the endpoint is reachable. Stripe sends POST requests to this same URL for events (checkout.session.completed, invoice.payment_succeeded, etc.). Configure that URL in Stripe Dashboard → Developers → Webhooks.',
  })
  @ApiResponse({ status: 200, description: 'Webhook URL and instructions' })
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
  @ApiOperation({
    summary: 'Stripe webhook receiver (Stripe only)',
    description:
      'Called by Stripe when events occur (payment succeeded, subscription created, etc.). Do not call this from your app or Swagger. Requires Stripe-Signature header. Used to update user subscription plan after payment.',
  })
  @ApiResponse({ status: 200, description: 'Webhook event processed' })
  @ApiResponse({ status: 400, description: 'Missing signature or invalid payload' })
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
