# Quick Payment System Troubleshooting Guide

## Issue: User Plan Not Upgrading After Payment

### Root Cause
❌ **Webhook controller was not registered** - Stripe events were being dropped

### Solution
✅ **FIXED** - Controller now registered in subscription module

---

## Issue: Webhook Verification Failing

### Root Cause
❌ **Webhook raw body middleware pointed to wrong route** (`/subscriptions/webhook` vs `/stripe/webhook`)

### Solution
✅ **FIXED** - Body parser now configured for correct route

---

## Webhook Endpoint URL

**Configure in Stripe Dashboard at:**
`https://yourdomain.com/stripe/webhook`

**Payload URL**: `https://yourdomain.com/stripe/webhook`
**Events to Subscribe**:
- ✓ checkout.session.completed
- ✓ customer.subscription.created
- ✓ customer.subscription.updated
- ✓ customer.subscription.deleted

---

## Testing Locally

```bash
# Start server
npm run dev

# In another terminal, start Stripe CLI
stripe login
stripe listen --forward-to localhost:3000/stripe/webhook

# Copy webhook signing secret from Stripe CLI output
# Set it in your .env as: STRIPE_WEBHOOK_SECRET=whsec_...

# Test a webhook event
stripe trigger customer.subscription.created

# Check server logs for: ✅ Stripe initialized + 🔔 Webhook received
```

---

## Environment Variables Required

```
STRIPE_SECRET_KEY=sk_test_... (or sk_live_...)
STRIPE_PUBLISHABLE_KEY=pk_test_... (or pk_live_...)
STRIPE_PRICE_PRO_MONTHLY=price_1ABC...
STRIPE_PRICE_PRO_YEARLY=price_1XYZ...
STRIPE_WEBHOOK_SECRET=whsec_... (from webhook endpoint setup)
FRONTEND_URL=http://localhost:3000 (or your production domain)
```

---

## Expected Logs When Everything Works

```
✅ Stripe initialized
✅ Checkout session created: cse_1ABC...
🔔 Webhook received: checkout.session.completed
🔗 Linked user abc123 → Stripe customer cus_XYZ
🔔 Webhook received: customer.subscription.created
🎉 User abc123 upgraded to PREMIUM
```

---

## If Webhooks Still Don't Work

1. **Check webhook secret is correct**: Compare `.env` with Stripe Dashboard
2. **Check URL is publicly accessible**: Use `ngrok` for testing
3. **Check event subscriptions**: Must include the 4 events listed above
4. **Check server logs**: Look for `❌ Stripe webhook verification failed`
5. **Check Stripe Dashboard**: Go to Webhooks > Events to see delivery attempts

---

## API Flow

```
User → POST /subscriptions/checkout
     ↓
Stripe Checkout Session Created
     ↓
User Completes Payment
     ↓
Stripe → POST /stripe/webhook (checkout.session.completed)
     ↓
Link user to Stripe customer
     ↓
Stripe → POST /stripe/webhook (customer.subscription.created)
     ↓
Upgrade user plan to PREMIUM ✓
```

Done! Your payment system is now fully operational.
