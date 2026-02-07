import {
  Controller,
  Post,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SubscriptionService } from './subscription.service.js';


@Controller('stripe')
export class StripeWebhookController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Post('webhook')
  async handleStripeWebhook(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      throw new BadRequestException('Missing Stripe signature');
    }

    await this.subscriptionService.handleWebhook(
      req.body as Buffer, // ✅ RAW BUFFER
      signature as string,
    );

    return res.json({ received: true });
  }
}
