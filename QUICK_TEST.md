# Quick Testing Guide - All 3 Fixes

## 🚀 Start Your Server

```bash
# Build the project
npm run build

# Start the development server
npm run start:dev
```

Server will run on: `http://localhost:5050`

---

## ✅ Test 1: Combined Rating in Book Slip

### Test the Fixed Endpoint:

```bash
curl -X POST http://localhost:5050/book-slip/discover \
  -H "Content-Type: application/json" \
  -d '{"input": "Fourth Wing by Rebecca Yarros"}'
```

### What to Look For:

**Before (Old Response):**
```json
{
  "externalRatings": {
    "average": 4.8,
    "count": 15000
  }
}
```

**After (New Response - FIX #1):**
```json
{
  "externalRatings": {
    "average": 4.8,
    "count": 15000
  },
  "spiceboundRatings": {
    "average": 4.6,
    "count": 127
  },
  "combinedRating": {
    "display": "4.7",
    "value": 4.7,
    "sources": ["External", "Spicebound"]
  }
}
```

✅ **Success:** If you see `combinedRating` in the response with `display`, `value`, and `sources`

---

## ✅ Test 2: Stripe Configuration

### Get a Test JWT Token:

```bash
# 1. Sign up a test user
curl -X POST http://localhost:5050/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "TestPassword123"
  }'

# Copy the accessToken from response
```

### Test Checkout Endpoint:

```bash
curl -X POST http://localhost:5050/subscriptions/checkout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"plan": "monthly"}'
```

### What to Look For:

**Success Response (FIX #2 working):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "...",
  "data": {
    "sessionId": "cs_test_xxxxxxxxxxxxx",
    "url": "https://checkout.stripe.com/pay/cs_test_xxxxxxxxxxxxx"
  }
}
```

**Error Response (if FIX #2 fails):**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Stripe not configured"
}
```

✅ **Success:** If you get a `sessionId` and checkout `url` (can paste into browser to see Stripe checkout)

---

## ✅ Test 3: Webhook Signature Verification

### Option A: Test with Stripe CLI (Best for Development)

```bash
# 1. Install Stripe CLI (one-time setup)
# https://stripe.com/docs/stripe-cli

# 2. Login to Stripe CLI
stripe login

# 3. Start listening for webhook events
stripe listen --forward-to localhost:5050/subscriptions/webhook

# You should see something like:
# > Ready! Your webhook signing secret is: whsec_test_xxxxx
# > Forwarding to http://localhost:5050/subscriptions/webhook

# 4. In another terminal, trigger a test event
stripe trigger customer.subscription.created

# 5. Check the first terminal output
# Should see: 200 OK (event processed successfully)
# If you see 400 error, signature verification failed
```

### Option B: Manual Test (Send Invalid Signature)

This should **FAIL** with 400 error (security working):

```bash
curl -X POST http://localhost:5050/subscriptions/webhook \
  -H "stripe-signature: invalid_signature" \
  -H "Content-Type: application/json" \
  -d '{"type": "customer.subscription.created", "data": {"object": {}}}'

# Expected response:
# {"success": false, "statusCode": 400, "message": "Webhook signature verification failed"}
```

### Option C: Webhook Without Signature Header

This should **FAIL** with 400 error:

```bash
curl -X POST http://localhost:5050/subscriptions/webhook \
  -H "Content-Type: application/json" \
  -d '{"type": "customer.subscription.created", "data": {"object": {}}}'

# Expected response:
# {"success": false, "statusCode": 400, "message": "Missing Stripe signature header"}
```

✅ **Success:** 
- Valid Stripe CLI events process with 200 OK
- Invalid signatures rejected with 400 error
- Missing header rejected with 400 error

---

## 📊 Quick Status Check

| Test | Command | Success Indicator |
|------|---------|-------------------|
| **FIX #1** | `POST /book-slip/discover` | Response includes `combinedRating` field |
| **FIX #2** | `POST /subscriptions/checkout` | Returns `sessionId` and `url` |
| **FIX #3** | Stripe CLI `stripe trigger` | Event processes with 200 OK |

---

## 🔧 Troubleshooting

### Issue: "Stripe not configured"
**Solution:** Verify `.env` has `STRIPE_SECRET_KEY` set correctly
```bash
# Check your .env file contains:
grep STRIPE_SECRET_KEY .env
# Should output: STRIPE_SECRET_KEY=sk_test_xxxxx
```

### Issue: "Missing Stripe signature header" on webhook
**Solution:** This is correct behavior! Stripe CLI and dashboard requests include the header automatically. Only happens if you send raw request without header.

### Issue: "Webhook signature verification failed" with Stripe CLI
**Solution:** Stripe CLI needs correct webhook secret. Run:
```bash
stripe listen --forward-to localhost:5050/subscriptions/webhook
```
This outputs the correct secret automatically.

### Issue: Combined rating shows "–" (dash)
**Solution:** This is correct! Minimum 10 ratings required. Book may not have enough ratings yet.

### Issue: Raw body error in other endpoints
**Solution:** Should not happen - we only parse JSON. If issues arise, CORS middleware handles it.

---

## 📝 Commands Summary

```bash
# Setup
npm install
npm run build

# Development
npm run start:dev

# Testing
npm test
npm run test:e2e

# Manual testing
# 1. Test book discovery:
curl -X POST http://localhost:5050/book-slip/discover \
  -H "Content-Type: application/json" \
  -d '{"input": "Fourth Wing by Rebecca Yarros"}'

# 2. Get JWT token:
curl -X POST http://localhost:5050/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "email": "test@test.com", "password": "Pass123!"}'

# 3. Test checkout:
curl -X POST http://localhost:5050/subscriptions/checkout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan": "monthly"}'

# 4. Test webhooks with Stripe CLI:
stripe listen --forward-to localhost:5050/subscriptions/webhook
stripe trigger customer.subscription.created
```

---

## ✨ You're All Set!

All 3 critical fixes are implemented and ready to test. 

**Next Step:** Follow the testing commands above to verify everything works. Then you're ready for production! 🚀
