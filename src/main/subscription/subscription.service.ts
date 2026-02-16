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
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.configService.get('FRONTEND_URL')}/subscription?success=true`,
      cancel_url: `${this.configService.get('FRONTEND_URL')}/subscription?canceled=true`,
      metadata: { userId },
    });

    this.logger.log(`✅ Checkout session created: ${session.id}`);
    return { url: session.url };
  }

  /* -------------------------------------------------------------------------- */
  /*                                   WEBHOOK                                  */
  /* -------------------------------------------------------------------------- */

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    this.logger.log('✅ Stripe webhook handler invoked');

    const webhookSecret =
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET') ||
      this.configService.get<string>('stripe.webhookSecret');

    if (!webhookSecret) {
      throw new BadRequestException('Webhook secret missing');
    }

    let event: Stripe.Event;

    try {
      this.logger.log('🔐 Verifying Stripe webhook signature');
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      this.logger.error('❌ Webhook verification failed', err.message);
      throw new BadRequestException(err.message);
    }

    this.logger.log(`🔔 Webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        this.logger.log(`[EVENT] Processing checkout.session.completed`);
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        this.logger.log(`[EVENT] Processing ${event.type}`);
        await this.handleSubscriptionUpsert(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'invoice.payment_succeeded':
        this.logger.log(`[EVENT] Processing invoice.payment_succeeded`);
        await this.handleInvoicePaid(
          event.data.object as Stripe.Invoice,
        );
        break;

      case 'customer.subscription.deleted':
        this.logger.log(`[EVENT] Processing customer.subscription.deleted`);
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
   * Step 1: Link Stripe customer → user
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

    this.logger.log(`🔗 Linked user ${userId} → customer ${customerId}`);
  }

  /**
   * Step 2: Subscription created/updated → upgrade user plan
   */
  private async handleSubscriptionUpsert(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const customerId = subscription.customer as string;
    const subscriptionId = subscription.id;

    this.logger.log(
      `[SUBSCRIPTION UPSERT] Subscription ID: ${subscriptionId}, Customer: ${customerId}, Status: ${subscription.status}`,
    );

    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!user) {
      this.logger.warn(`❌ No user found for customer ${customerId}`);
      return;
    }

    this.logger.log(`✅ Found user ${user.id} (${user.email}) for customer ${customerId}`);

    const plan = SubscriptionPlan.PREMIUM;

    // Check if subscription record exists
    const existing = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
    });

    if (existing) {
      this.logger.log(
        `[UPDATE] Existing subscription found: ${existing.id}. Updating status to ${subscription.status}`,
      );
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: { status: subscription.status, plan },
      });
    } else {
      this.logger.log(`[CREATE] Creating new subscription for user ${user.id}`);
      await this.prisma.subscription.create({
        data: {
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: customerId,
          status: subscription.status,
          plan,
          userId: user.id,
        },
      });
    }

    // Upgrade user plan to PREMIUM
    this.logger.log(`[UPDATE USER PLAN] Upgrading user ${user.id} to ${plan}`);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { plan },
    });

    this.logger.log(`🎉 User ${user.id} (${user.email}) upgraded to ${plan}`);
  }

  /**
   * Step 3: Payment confirmed → create subscription + upgrade plan

   */
  private async handleInvoicePaid(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const customerId = invoice.customer as string;
    const invoiceId = invoice.id;

    this.logger.log(
      `[INVOICE PAID] Invoice ID: ${invoiceId}, Customer: ${customerId}, Status: ${invoice.status}, Amount: ${invoice.amount_paid}`,
    );

    const line = invoice.lines?.data?.[0];
    const subscriptionId = line?.subscription as string;

    this.logger.log(
      `[INVOICE] Lines count: ${invoice.lines?.data?.length || 0}, SubscriptionId from line: ${subscriptionId}`,
    );

    if (!customerId || !subscriptionId) {
      this.logger.warn(
        `❌ invoice.payment_succeeded missing data - customerId: ${customerId}, subscriptionId: ${subscriptionId}`,
      );
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!user) {
      this.logger.warn(`❌ No user found for customer ${customerId}`);
      return;
    }

    this.logger.log(`✅ Found user ${user.id} (${user.email}) for customer ${customerId}`);

    const plan = SubscriptionPlan.PREMIUM;

    const existing = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
    });

    if (existing) {
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: { status: 'active', plan },
      });
    } else {
      await this.prisma.subscription.create({
        data: {
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: customerId,
          status: 'active',
          plan,
          userId: user.id,
        },
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { plan },
    });

    this.logger.log(
      `💰 Invoice paid → User ${user.id} upgraded to PREMIUM`,
    );
  }
  /**
   * Step 3: Subscription canceled → downgrade
   */
  private async handleSubscriptionCanceled(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!sub) {
      this.logger.warn(`⚠️ Subscription not found: ${subscription.id}`);
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

    this.logger.log(
      `Retrieved subscription for user ${userId}: ${sub ? sub.plan : 'FREE'}`,
    );

    return (
      sub ?? {
        plan: SubscriptionPlan.FREE,
        status: 'inactive',
      }
    );
  }
}
