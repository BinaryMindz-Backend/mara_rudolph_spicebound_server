import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubscriptionPlan } from '../../../prisma/generated/prisma-client/enums.js';


 
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
      // Dynamically import Stripe (supports optional dependency)
      const Stripe = require('stripe');
      const stripeKey = this.configService.get<string>('stripe.secretKey');

      if (!stripeKey) {
        this.logger.warn('Stripe key not configured');
        this.stripe = null;
      } else {
        this.stripe = new Stripe(stripeKey);
      }
    } catch (error) {
      this.logger.warn('Stripe SDK not installed. Install with: npm install stripe');
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
      throw new BadRequestException('Stripe not configured');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const priceId =
      plan === 'yearly'
        ? this.configService.get('stripe.priceYearly')
        : this.configService.get('stripe.priceMonthly');

    try {
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

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      this.logger.error('Stripe session creation failed', error);
      throw new BadRequestException('Failed to create checkout session');
    }
  }

  /**
   * Handle Stripe webhook for subscription events
   */
  async handleWebhook(event: any): Promise<void> {
    if (!this.stripe) {
      throw new BadRequestException('Stripe not configured');
    }

    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionCanceled(event.data.object);
          break;

        case 'payment_intent.succeeded':
          this.logger.log('Payment succeeded');
          break;

        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
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
   * Internal: Handle subscription created/updated
   */
  private async handleSubscriptionUpdate(stripeSubscription: any): Promise<void> {
    try {
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

          // Upgrade user plan
          await this.prisma.user.update({
            where: { id: user.id },
            data: { plan: SubscriptionPlan.PREMIUM },
          });
        }
      }

      this.logger.log(
        `Subscription updated: ${stripeSubscription.id} - ${stripeSubscription.status}`,
      );
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

        this.logger.log(`User ${subscription.userId} downgraded to FREE plan`);
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
