import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/user.decorators.js';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckout(
    @CurrentUser() userId: string,
    @Body() body: { plan: 'monthly' | 'yearly' },
  ) {
    return this.subscriptionService.createCheckoutSession(userId, body.plan);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getSubscription(@CurrentUser() userId: string) {
    return this.subscriptionService.getUserSubscription(userId);
  }

  @Get('downgrade-impact')
  @UseGuards(JwtAuthGuard)
  async checkDowngradeImpact(@CurrentUser() userId: string) {
    return this.subscriptionService.checkDowngradeImpact(userId);
  }

  @Post('webhook')
  async handleWebhook(@Req() req: any) {
    const signature = req.headers['stripe-signature'];
    
    if (!signature) {
      throw new BadRequestException('Missing Stripe signature header');
    }

    // Get raw body for signature verification
    const rawBody = req.rawBody || JSON.stringify(req.body);

    await this.subscriptionService.handleWebhook(rawBody, signature);
    return { received: true };
  }
}
