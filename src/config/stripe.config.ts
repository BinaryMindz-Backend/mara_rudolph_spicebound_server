import { registerAs } from '@nestjs/config';

export default registerAs('stripe', () => ({
  secretKey: process.env.STRIPE_SECRET_KEY,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  priceMonthly: process.env.STRIPE_PRICE_MONTHLY_ID || 'price_monthly',
  priceYearly: process.env.STRIPE_PRICE_YEARLY_ID || 'price_yearly',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
}));
