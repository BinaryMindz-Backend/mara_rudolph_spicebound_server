import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/user.decorators.js';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @ApiBearerAuth('access-token')
  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  async createCheckout(
    @CurrentUser() userId: string,
    @Body() body: any,
  ) {
    if (!userId) {
      throw new UnauthorizedException('Missing or invalid authentication');
    }

    const plan = body?.plan;

    if (!plan) {
      throw new BadRequestException('Missing required field: plan. Expected: {"plan": "monthly" | "yearly"}');
    }

    if (plan !== 'monthly' && plan !== 'yearly') {
      throw new BadRequestException(`Invalid plan value. Got: "${plan}". Expected: "monthly" or "yearly"`);
    }

    return this.subscriptionService.createCheckoutSession(userId, plan);
  }

  @ApiBearerAuth('access-token')
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user subscription details' })
  async getSubscription(@CurrentUser() userId: string) {
    return this.subscriptionService.getUserSubscription(userId);
  }

  @ApiBearerAuth('access-token')
  @Get('downgrade-impact')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Check impact of subscription downgrade' })
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
