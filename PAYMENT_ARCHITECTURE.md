# Complete Payment System Architecture

## System Overview

```
┌─────────────┐         ┌──────────────┐         ┌───────────────┐
│   Frontend  │         │   Backend    │         │    Stripe     │
│  (React)    │◄───────►│   (NestJS)   │◄───────►│   Platform    │
└─────────────┘         └──────────────┘         └───────────────┘
                              │
                              ├─ Subscriptions Module
                              │  ├─ subscription.service.ts
                              │  ├─ subscription.controller.ts
                              │  └─ stripe-webhook.controller.ts ✓ (FIXED)
                              │
                              └─ Database (PostgreSQL)
                                 └─ User (plan, stripeCustomerId)
                                 └─ Subscription (status, records)
```

---

## Checkout Flow (User Upgrade to Premium)

```
STEP 1: User clicks "Upgrade to Premium"
│
├─ Frontend: GET user JWT token
├─ Frontend: POST /subscriptions/checkout
│   {
│     "plan": "monthly" | "yearly"
│   }
│
└─► Backend SubscriptionController.createCheckout()
    │
    ├─ Verify user exists
    ├─ Get Stripe price ID from config
    │  (STRIPE_PRICE_PRO_MONTHLY or STRIPE_PRICE_PRO_YEARLY)
    │
    └─► Create Stripe checkout session
        ├─ Mode: "subscription"
        ├─ Line item: Stripe price ID
        ├─ Customer email: user.email
        ├─ Metadata: { userId }
        ├─ Success URL: FRONTEND_URL/subscription?success=true
        └─ Cancel URL: FRONTEND_URL/subscription?canceled=true
        
        Response: { url: "https://checkout.stripe.com/..." }


STEP 2: Frontend redirects user to Stripe Checkout
│
├─ User fills payment info
├─ User completes payment
│
└─► Stripe processes payment successfully


STEP 3: Stripe redirects back to success URL
│
├─ User sees "Payment successful" page
├─ Frontend updates subscription status
│
└─► User sees "PREMIUM" badge
```

---

## Webhook Flow (System Upgrade After Payment)

```
STRIPE WEBHOOKS → POST /stripe/webhook (with Stripe-Signature header)
                  ↓
                  Webhook verification in SubscriptionService
                  ├─ Get STRIPE_WEBHOOK_SECRET from config
                  ├─ Verify signature matches request
                  └─ Parse Stripe event


EVENT 1: checkout.session.completed
│
├─ Extract: userId (from metadata), customerId (from session)
│
└─► Database Update:
    User.stripeCustomerId = customerId
    
    Logs: 🔗 Linked user {userId} → Stripe customer {customerId}


EVENT 2: customer.subscription.created
│
├─ Extract: customerId, stripeSubscriptionId, subscription status
│
├─ Find user by stripeCustomerId
│
├─ Create subscription record:
│   {
│     userId,
│     stripeCustomerId,
│     stripeSubscriptionId,
│     plan: "PREMIUM",
│     status: subscription.status
│   }
│
└─► Database Updates:
    Subscription.create(...)
    User.plan = "PREMIUM"
    
    Logs: 🎉 User {userId} upgraded to PREMIUM


EVENT 3: customer.subscription.updated
│
├─ Extract: stripeSubscriptionId, new status
│
├─ Find subscription record
│
└─► Database Update:
    Subscription.update({ status: newStatus })
    
    Logs: 📝 Subscription {subId} updated to {status}


EVENT 4: customer.subscription.deleted (user cancels)
│
├─ Extract: stripeSubscriptionId
│
├─ Find subscription record with user relationship
│
└─► Database Updates:
    User.plan = "FREE"
    Subscription.delete(...)
    
    Logs: ⬇️ User {userId} downgraded to FREE
```

---

## State Transitions

```
┌──────────────────────────────────────────────────────────────┐
│                    USER PLAN STATES                          │
└──────────────────────────────────────────────────────────────┘

Initial State:
User.plan = "FREE"
User.stripeCustomerId = null
Subscription = null


After Checkout Completed:
User.plan = "FREE"  (unchanged yet)
User.stripeCustomerId = "cus_ABC123"  ✓ (updated)
Subscription = null


After Subscription Created:
User.plan = "PREMIUM"  ✓ (upgraded)
User.stripeCustomerId = "cus_ABC123"
Subscription = { status: "active", ... }  ✓ (created)


After Subscription Deleted (Cancellation):
User.plan = "FREE"  ✓ (downgraded)
User.stripeCustomerId = "cus_ABC123"  (unchanged)
Subscription = null  ✓ (deleted)
```

---

## Database Schema

```typescript
User {
  id: UUID
  email: String @unique
  password: String
  plan: Enum(FREE, PREMIUM) @default(FREE)
  stripeCustomerId: String?  // Linked by checkout.session.completed
  createdAt: DateTime
  
  // Relations
  subscriptions: Subscription[]
  library: UserBook[]
  ratings: Rating[]
}

Subscription {
  id: CUID
  userId: String
  stripeCustomerId: String      // From Stripe event
  stripeSubscriptionId: String  // Stripe subscription ID
  plan: Enum(FREE, PREMIUM)
  status: String               // active, past_due, canceled, etc.
  createdAt: DateTime
  updatedAt: DateTime
  
  // Relations
  user: User @relation(fields: [userId])
}
```

---

## Configuration Flow

```
environment (.env)
    ├─ STRIPE_SECRET_KEY
    ├─ STRIPE_PUBLISHABLE_KEY
    ├─ STRIPE_PRICE_PRO_MONTHLY
    ├─ STRIPE_PRICE_PRO_YEARLY
    ├─ STRIPE_WEBHOOK_SECRET
    └─ FRONTEND_URL
       ↓
stripe.config.ts (registers config)
       ↓
SubscriptionService constructor
       ├─ Initialize Stripe client with secret key
       ├─ Store config for price IDs and webhook secret
       └─ Log: ✅ Stripe initialized
       ↓
Used in:
├─ createCheckoutSession() - gets price IDs
└─ handleWebhook() - gets webhook secret
```

---

## Error Handling

```
Missing STRIPE_SECRET_KEY
└─ Error thrown at service initialization
   App fails to start


Missing Stripe Price ID
└─ BadRequestException: "Stripe price not configured"
   Response: 400


Invalid Webhook Signature
└─ BadRequestException: err.message
   Response: 400
   Log: ❌ Stripe webhook verification failed


Missing Stripe Webhook Secret
└─ BadRequestException: "Webhook secret missing"
   Response: 400


Missing User
└─ NotFoundException: "User not found"
   Response: 404


Webhook event without matching data
└─ Logs warning: "⚠️ No user found for customer {customerId}"
   Event silently dropped (idempotent)
```

---

## Key Features Implemented

✅ **Secure Webhook Verification**
   - Signature validation on every webhook
   - Raw body required for verification

✅ **Idempotent Webhooks**
   - Duplicate events don't create duplicate subscriptions
   - Upsert pattern on subscription creation/update

✅ **Plan Management**
   - User.plan tracks current subscription state
   - Separate Subscription table for detailed records
   - Automatic downgrade on cancellation

✅ **Error Resilience**
   - Missing user doesn't crash webhook
   - Proper logging at each step
   - Descriptive error messages

✅ **Environment Configuration**
   - Supports both test and production keys
   - Fallback configuration patterns
   - Secrets never hardcoded

---

## Testing Scenarios

### Scenario 1: Successful Purchase
```
1. User clicks "Upgrade"
2. POST /subscriptions/checkout
3. Redirect to Stripe Checkout
4. User completes payment
5. Redirect to success URL
6. Stripe sends 2 webhooks:
   - checkout.session.completed (link customer)
   - customer.subscription.created (upgrade plan)
7. User.plan = PREMIUM ✓
```

### Scenario 2: Subscription Cancellation
```
1. User clicks "Cancel Subscription"
   (or user cancels in Stripe Dashboard)
2. Stripe sends webhook:
   - customer.subscription.deleted
3. User.plan = FREE ✓
4. Subscription record deleted
```

### Scenario 3: Webhook Retry
```
1. First webhook delivery fails
2. Stripe retries (up to 5 times)
3. When successful, same event processed
4. Idempotent handlers prevent duplicates
5. Second/third attempt updates same records
```

### Scenario 4: Signature Verification Fails
```
1. Malformed webhook or wrong secret
2. Signature verification fails
3. BadRequestException returned (400)
4. Stripe retries later
5. Eventually succeeds with correct signature
```

---

## Monitoring & Logging

### Success Logs to Look For
```
✅ Stripe initialized
✅ Checkout session created: cse_...
🔔 Webhook received: checkout.session.completed
🔗 Linked user {id} → Stripe customer cus_...
🔔 Webhook received: customer.subscription.created
🎉 User {id} upgraded to PREMIUM
```

### Error Logs to Investigate
```
❌ Stripe webhook verification failed
⚠️ No user found for customer {id}
⚠️ Subscription not found: {id}
```

---

## Production Readiness Checklist

- [ ] Use Stripe live keys (sk_live_*, pk_live_*)
- [ ] Webhook endpoint registered in Stripe Dashboard
- [ ] All 4 webhook events subscribed
- [ ] HTTPS enabled on webhook endpoint
- [ ] Webhook secret stored in production .env
- [ ] Price IDs configured for monthly and yearly
- [ ] Frontend URL points to correct domain
- [ ] Database backups configured
- [ ] Logs being monitored/aggregated
- [ ] Rate limiting configured on webhook endpoint

---

## Summary

Your payment system now has a complete, working flow:

1. **Checkout**: User initiates payment
2. **Session**: Stripe creates checkout session
3. **Payment**: User completes payment on Stripe
4. **Webhook 1**: checkout.session.completed links customer
5. **Webhook 2**: customer.subscription.created upgrades plan
6. **Database**: User.plan changes from FREE to PREMIUM
7. **Frontend**: User sees their new PREMIUM status

All pieces are now properly connected! 🎉
