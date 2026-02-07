import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubscriptionPlan } from '../../../prisma/generated/prisma-client/enums.js';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secretKey =
      this.configService.get<string>('STRIPE_SECRET_KEY') ||
      this.configService.get<string>('stripe.secretKey');

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is missing');
    }

    this.stripe = new Stripe(secretKey);

    this.logger.log('✅ Stripe initialized');
  }

  /* -------------------------------------------------------------------------- */
  /*                               CHECKOUT FLOW                                */
  /* -------------------------------------------------------------------------- */

  async createCheckoutSession(
    userId: string,
    plan: 'monthly' | 'yearly',
  ): Promise<{ url: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const priceId =
      plan === 'yearly'
        ? this.configService.get('STRIPE_PRICE_PRO_YEARLY')
        : this.configService.get('STRIPE_PRICE_PRO_MONTHLY');

    if (!priceId) {
      throw new BadRequestException('Stripe price not configured');
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${this.configService.get(
        'FRONTEND_URL',
      )}/subscription?success=true`,
      cancel_url: `${this.configService.get(
        'FRONTEND_URL',
      )}/subscription?canceled=true`,
      metadata: {
        userId,
      },
    });

    this.logger.log(`✅ Checkout session created: ${session.id}`);

    return { url: session.url };
  }

  /* -------------------------------------------------------------------------- */
  /*                                 WEBHOOK                                    */
  /* -------------------------------------------------------------------------- */

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret =
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET') ||
      this.configService.get<string>('stripe.webhookSecret');

    if (!webhookSecret) {
      throw new BadRequestException('Webhook secret missing');
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      this.logger.error(
        '❌ Stripe webhook verification failed',
        err.message,
      );
      throw new BadRequestException(err.message);
    }

    this.logger.log(`🔔 Webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpsert(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionCanceled(
          event.data.object as Stripe.Subscription,
        );
        break;

      default:
        this.logger.debug(`⏭ Ignored event: ${event.type}`);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                             WEBHOOK HANDLERS                               */
  /* -------------------------------------------------------------------------- */

  /**
   * Only link Stripe customer → user
   */
  private async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const userId = session.metadata?.userId;
    const customerId = session.customer as string;

    if (!userId || !customerId) {
      this.logger.warn('checkout.session.completed missing data');
      return;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });

    this.logger.log(
      `🔗 Linked user ${userId} → Stripe customer ${customerId}`,
    );
  }

  /**
   * Create or update subscription + upgrade user plan
   */
  private async handleSubscriptionUpsert(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const customerId = subscription.customer as string;
    const priceId = subscription.items.data[0].price.id;

    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!user) {
      this.logger.warn(`⚠️ No user found for customer ${customerId}`);
      return;
    }

    let plan: SubscriptionPlan;

    // Map any known paid price to PREMIUM plan. Adjust mapping if you add tiers.
    plan = SubscriptionPlan.PREMIUM;

    // Upsert is not possible on non-unique fields; do a find then create/update
    const existing = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (existing) {
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: { status: subscription.status, plan },
      });
    } else {
      await this.prisma.subscription.create({
        data: {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: customerId,
          status: subscription.status,
          plan,
          userId: user.id,
        },
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { plan },
    });

    this.logger.log(`🎉 User ${user.id} upgraded to ${plan}`);
  }

  /**
   * Downgrade user when subscription is canceled
   */
  private async handleSubscriptionCanceled(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
      include: { user: true },
    });

    if (!sub) {
      this.logger.warn(
        `⚠️ Subscription not found: ${subscription.id}`,
      );
      return;
    }

    await this.prisma.user.update({
      where: { id: sub.userId },
      data: { plan: SubscriptionPlan.FREE },
    });

    await this.prisma.subscription.delete({
      where: { id: sub.id },
    });

    this.logger.log(`⬇️ User ${sub.userId} downgraded to FREE`);
  }

  /* -------------------------------------------------------------------------- */
  /*                               READ HELPERS                                 */
  /* -------------------------------------------------------------------------- */

  async getUserSubscription(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId },
    });

    return (
      sub ?? {
        plan: SubscriptionPlan.FREE,
        status: 'inactive',
      }
    );
  }
}
