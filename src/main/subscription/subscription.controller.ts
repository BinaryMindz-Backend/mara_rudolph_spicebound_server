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
  async createCheckout(
    @CurrentUser() userId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.subscriptionService.createCheckoutSession(userId, dto.plan);
  }

  @ApiBearerAuth('access-token')
  @Get()
  @UseGuards(JwtAuthGuard)
  async getSubscription(@CurrentUser() userId: string) {
    return this.subscriptionService.getUserSubscription(userId);
  }
}
