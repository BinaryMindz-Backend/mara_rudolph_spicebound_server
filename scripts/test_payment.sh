#!/bin/bash

# Create test user
echo "=== Creating test user ==="
SIGNUP_RESPONSE=$(curl -s -X POST http://localhost:5050/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Premium User",
    "email": "testpremium'$(date +%s)'@test.com",
    "password": "TestPassword123!"
  }')

echo "$SIGNUP_RESPONSE" | jq .

# Extract access token
ACCESS_TOKEN=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.accessToken')
USER_ID=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.user.id')
EMAIL=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.user.email')

echo ""
echo "=== User Created ==="
echo "User ID: $USER_ID"
echo "Email: $EMAIL"
echo "Access Token: $ACCESS_TOKEN"
echo ""

# Create checkout session
echo "=== Creating Checkout Session ==="
CHECKOUT=$(curl -s -X POST http://localhost:5050/subscriptions/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "plan": "monthly"
  }')

echo "$CHECKOUT" | jq .

CHECKOUT_URL=$(echo "$CHECKOUT" | jq -r '.data.url // .url')
echo ""
echo "Checkout URL: $CHECKOUT_URL"
echo ""

# Get subscription status before webhook
echo "=== Subscription Status (BEFORE webhook) ==="
curl -s -X GET http://localhost:5050/subscriptions \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "=== Now trigger: stripe trigger customer.subscription.created ==="
echo "Keep stripe listen running in another terminal to process the event"
