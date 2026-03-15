import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
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
  async createCheckout(
    @CurrentUser() userId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.subscriptionService.createCheckoutSession(
      userId,
      dto.plan,
      dto.returnUrl,
    );
  }

  /**
   * Sync subscription from Stripe using the checkout session ID (in success URL).
   * Call this when the user lands on /subscription?success=true&session_id=cs_xxx
   * so the plan updates even if webhooks never fired.
   */
  @ApiBearerAuth('access-token')
  @Get('sync')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Sync subscription from checkout session',
    description:
      'Call after redirect from Stripe checkout (URL has session_id). Updates user plan from Stripe so it works without webhooks. Frontend: when /subscription?success=true&session_id=cs_xxx, call GET /subscriptions/sync?session_id=cs_xxx with Bearer token.',
  })
  @ApiQuery({
    name: 'session_id',
    required: true,
    description: 'Stripe checkout session ID (cs_...)',
  })
  async syncSubscription(
    @CurrentUser() userId: string,
    @Query('session_id') sessionId: string,
  ) {
    if (!sessionId?.startsWith('cs_')) {
      throw new BadRequestException('Invalid session_id');
    }
    return this.subscriptionService.syncFromCheckoutSession(sessionId, userId);
  }

  @ApiBearerAuth('access-token')
  @Get()
  @UseGuards(JwtAuthGuard)
  async getSubscription(@CurrentUser() userId: string) {
    return this.subscriptionService.getUserSubscription(userId);
  }

  @ApiBearerAuth('access-token')
  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Cancel current subscription',
    description:
      'Cancels the user’s latest Stripe subscription immediately and downgrades the user to FREE.',
  })
  async cancelSubscription(@CurrentUser() userId: string) {
    return this.subscriptionService.cancelCurrentSubscription(userId);
  }
}
