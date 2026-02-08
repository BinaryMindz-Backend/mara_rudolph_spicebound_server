import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionService } from './subscription.service.js';
import { SubscriptionController } from './subscription.controller.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';

@Module({
  imports: [ConfigModule],
  providers: [SubscriptionService],
  controllers: [SubscriptionController, StripeWebhookController],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
