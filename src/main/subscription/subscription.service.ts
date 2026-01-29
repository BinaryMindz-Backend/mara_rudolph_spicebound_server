import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubscriptionPlan } from '../../../prisma/generated/prisma-client/enums.js';
import Stripe from 'stripe';
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private stripe: any;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.initializeStripe();
  }

  private initializeStripe(): void {
    try {
      // Try multiple paths to get the key
      let stripeKey = this.configService.get<string>('stripe.secretKey');
      if (!stripeKey) {
        stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
      }

      if (!stripeKey) {
        this.logger.warn('⚠️ Stripe key not configured. Check STRIPE_SECRET_KEY in .env');
        this.stripe = null;
        return;
      }

      this.stripe = new Stripe(stripeKey);
      this.logger.log('✅ Stripe initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Stripe:', error?.message || error);
      this.stripe = null;
    }
  }

  /**
   * Create checkout session for subscription
   */
  async createCheckoutSession(
    userId: string,
    plan: 'monthly' | 'yearly',
  ): Promise<{ sessionId: string; url: string }> {
    if (!this.stripe) {
      this.logger.error('❌ Stripe not initialized - check STRIPE_SECRET_KEY env variable');
      throw new BadRequestException(
        'Payment system not configured. Please contact support.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get price IDs from config - try multiple paths
    let priceMonthly = this.configService.get('stripe.priceMonthly');
    let priceYearly = this.configService.get('stripe.priceYearly');
    
    if (!priceMonthly) {
      priceMonthly = this.configService.get('STRIPE_PRICE_PRO_MONTHLY');
    }
    if (!priceYearly) {
      priceYearly = this.configService.get('STRIPE_PRICE_PRO_YEARLY');
    }

    const priceId = plan === 'yearly' ? priceYearly : priceMonthly;

    if (!priceId) {
      this.logger.error(`❌ Missing Stripe price ID for plan: ${plan}`);
      throw new BadRequestException(`Stripe price not configured for ${plan} plan`);
    }

    try {
      this.logger.log(`🔄 Creating Stripe checkout session for user ${userId}, plan: ${plan}`);
      
      const session = await this.stripe.checkout.sessions.create({
        customer_email: user.email,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${this.configService.get('FRONTEND_URL')}/subscription?success=true`,
        cancel_url: `${this.configService.get('FRONTEND_URL')}/subscription?canceled=true`,
        metadata: {
          userId,
        },
      });

      this.logger.log(`✅ Checkout session created: ${session.id}`);
      
      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      this.logger.error('❌ Stripe session creation failed', error);
      throw new BadRequestException(`Failed to create checkout session: ${error.message}`);
    }
  }

  /**
   * Handle Stripe webhook for subscription events
   */
  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    if (!this.stripe) {
      throw new BadRequestException('Stripe not configured');
    }

    const webhookSecret = this.configService.get<string>('stripe.webhookSecret');

    if (!webhookSecret) {
      this.logger.error('Stripe webhook secret not configured');
      throw new BadRequestException('Webhook secret not configured');
    }

    // Verify Stripe signature
    let event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
      this.logger.log(`✅ Webhook signature verified: ${event.type}`);
    } catch (error) {
      this.logger.error('Webhook signature verification failed', error);
      throw new BadRequestException(`Webhook signature verification failed: ${error.message}`);
    }

    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          this.logger.log(`🔄 Processing subscription event: ${event.type}`);
          await this.handleSubscriptionUpdate(event.data.object);
          break;

        case 'customer.subscription.deleted':
          this.logger.log(`🔄 Processing subscription canceled: ${event.type}`);
          await this.handleSubscriptionCanceled(event.data.object);
          break;

        case 'payment_intent.succeeded':
          this.logger.log(`💳 Payment succeeded: ${event.data.object.id}`);
          break;

        case 'payment_intent.payment_failed':
          this.logger.warn(`❌ Payment failed: ${event.data.object.id}`);
          break;

        default:
          this.logger.debug(`⏭️  Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error('Webhook handling failed', error);
      throw error;
    }
  }

  /**
   * Get subscription for user
   */
  async getUserSubscription(userId: string): Promise<any> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId },
    });

    if (!subscription) {
      return {
        plan: SubscriptionPlan.FREE,
        status: 'inactive',
      };
    }

    return subscription;
  }

  /**
   * Check if user can downgrade (has books beyond free limit)
   */
  async checkDowngradeImpact(userId: string): Promise<{
    canDowngrade: boolean;
    booksAboveLimit: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        library: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const FREE_LIMIT = 3;
    const booksAboveLimit = Math.max(0, user.library.length - FREE_LIMIT);

    return {
      canDowngrade: booksAboveLimit === 0,
      booksAboveLimit,
    };
  }

  /**
   * TEST helper: set stripe customer id for a user (development only)
   */
  async setUserStripeCustomer(userId: string, customerId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });
  }

  /**
   * Internal: Handle subscription created/updated
   */
  private async handleSubscriptionUpdate(stripeSubscription: any): Promise<void> {
    try {
      this.logger.log(`🔍 Subscription update: ID=${stripeSubscription.id}, Status=${stripeSubscription.status}`);

      // Find or create subscription record
      const existingSubscription = await this.prisma.subscription.findFirst({
        where: {
          stripeSubscriptionId: stripeSubscription.id,
        },
      });

      const subscriptionData: any = {
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: stripeSubscription.customer,
        status: stripeSubscription.status,
        plan: SubscriptionPlan.PREMIUM,
      };

      if (existingSubscription) {
        await this.prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: subscriptionData,
        });
        this.logger.log(`✅ Subscription updated: ${stripeSubscription.id}`);
      } else {
        // Find user by Stripe customer
        const user = await this.findUserByStripeCustomer(
          stripeSubscription.customer,
        );

        if (user) {
          await this.prisma.subscription.create({
            data: {
              userId: user.id,
              ...subscriptionData,
            },
          });
          this.logger.log(`✅ Subscription created for user: ${user.id}`);

          // Upgrade user plan
          await this.prisma.user.update({
            where: { id: user.id },
            data: { plan: SubscriptionPlan.PREMIUM },
          });
          this.logger.log(`🎉 User ${user.id} upgraded to PREMIUM plan`);
        } else {
          this.logger.warn(`⚠️ No user found for customer: ${stripeSubscription.customer}`);
        }
      }
    } catch (error) {
      this.logger.error('Subscription update failed', error);
      throw error;
    }
  }

  /**
   * Internal: Handle subscription canceled
   */
  private async handleSubscriptionCanceled(stripeSubscription: any): Promise<void> {
    try {
      this.logger.log(`🔍 Processing subscription cancellation: ${stripeSubscription.id}`);

      const subscription = await this.prisma.subscription.findFirst({
        where: {
          stripeSubscriptionId: stripeSubscription.id,
        },
        include: {
          user: true,
        },
      });

      if (subscription) {
        // Downgrade user to free plan
        await this.prisma.user.update({
          where: { id: subscription.userId },
          data: { plan: SubscriptionPlan.FREE },
        });

        // Delete subscription record
        await this.prisma.subscription.delete({
          where: { id: subscription.id },
        });

        this.logger.log(`⬇️ User ${subscription.userId} downgraded to FREE plan`);
      } else {
        this.logger.warn(`⚠️ Subscription not found: ${stripeSubscription.id}`);
      }
    } catch (error) {
      this.logger.error('Subscription cancellation handling failed', error);
      throw error;
    }
  }

  /**
   * Internal: Find user by Stripe customer ID
   */
  private async findUserByStripeCustomer(customerId: string): Promise<any> {
    return this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    });
  }
}
