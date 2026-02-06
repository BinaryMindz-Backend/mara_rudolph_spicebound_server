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
import { CreateCheckoutDto } from './dto/create-checkout.dto.js';

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
    @Body() dto: CreateCheckoutDto,
  ) {
    if (!userId) {
      throw new UnauthorizedException('Missing or invalid authentication');
    }

    return this.subscriptionService.createCheckoutSession(userId, dto.plan);
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

  // Dev-only: set stripe customer id for current user (used for testing webhooks)
  // @ApiBearerAuth('access-token')
  // @Post('test/set-customer')
  // @UseGuards(JwtAuthGuard)
  // @ApiOperation({ summary: '[DEV] Set Stripe customer id for user' })
  // async setCustomer(
  //   @CurrentUser() userId: string,
  //   @Body('customerId') customerId: string,
  // ) {
  //   if (!customerId) {
  //     throw new BadRequestException('Missing customerId');
  //   }

  //   return this.subscriptionService.setUserStripeCustomer(userId, customerId);
  // }

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
