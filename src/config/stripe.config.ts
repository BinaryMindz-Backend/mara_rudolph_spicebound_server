import { registerAs } from '@nestjs/config';

export default registerAs('stripe', () => ({
  secretKey: process.env.STRIPE_SECRET_KEY,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  priceMonthly:
    process.env.STRIPE_PRICE_PRO_MONTHLY || process.env.STRIPE_PRICE_MONTHLY_ID,
  priceYearly:
    process.env.STRIPE_PRICE_PRO_YEARLY || process.env.STRIPE_PRICE_YEARLY_ID,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
}));
