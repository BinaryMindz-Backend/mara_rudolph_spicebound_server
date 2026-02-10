#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========== STRIPE PAYMENT FLOW TEST ==========${NC}\n"

# Step 1: Create test user
echo -e "${YELLOW}[1/5] Creating test user...${NC}"
SIGNUP=$(curl -s -X POST http://localhost:5050/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "stripetest'$(date +%s%N)'@test.com",
    "password": "TestPass123!"
  }')

ACCESS_TOKEN=$(echo "$SIGNUP" | jq -r '.data.accessToken // empty')
USER_ID=$(echo "$SIGNUP" | jq -r '.data.user.id // empty')
EMAIL=$(echo "$SIGNUP" | jq -r '.data.user.email // empty')

if [ -z "$ACCESS_TOKEN" ] || [ -z "$USER_ID" ]; then
  echo -e "${RED}❌ Failed to create user${NC}"
  echo "$SIGNUP" | jq .
  exit 1
fi

echo -e "${GREEN}✅ User created: $USER_ID ($EMAIL)${NC}\n"

# Step 2: Create checkout session
echo -e "${YELLOW}[2/5] Creating checkout session...${NC}"
CHECKOUT=$(curl -s -X POST http://localhost:5050/subscriptions/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"plan": "monthly"}')

SESSION_URL=$(echo "$CHECKOUT" | jq -r '.data.url // empty')
if [ -z "$SESSION_URL" ]; then
  echo -e "${RED}❌ Failed to create checkout session${NC}"
  echo "$CHECKOUT" | jq .
  exit 1
fi

echo -e "${GREEN}✅ Checkout session created${NC}"
echo -e "${BLUE}Checkout URL: $SESSION_URL${NC}\n"

# Step 3: Check subscription BEFORE webhook
echo -e "${YELLOW}[3/5] Checking subscription status BEFORE webhook...${NC}"
BEFORE=$(curl -s -X GET http://localhost:5050/subscriptions \
  -H "Authorization: Bearer $ACCESS_TOKEN")

PLAN_BEFORE=$(echo "$BEFORE" | jq -r '.data.plan // empty')
echo -e "Plan: ${YELLOW}$PLAN_BEFORE${NC}"
echo -e "Full response:"
echo "$BEFORE" | jq . | sed 's/^/  /'
echo

# Step 4: Wait and instruct user
echo -e "${YELLOW}[4/5] Waiting for webhook events...${NC}"
echo -e "${BLUE}The Stripe CLI listener should be running in another terminal.${NC}"
echo -e "${BLUE}Stripe will automatically send webhook events for this checkout session.${NC}"
echo -e "${BLUE}${NC}"
echo -e "${YELLOW}Key Stripe Test Card: 4242 4242 4242 4242${NC}"
echo -e "${YELLOW}Expiry: Any future date (e.g., 12/26)${NC}"
echo -e "${YELLOW}CVC: Any 3 digits${NC}"
echo
echo -e "${BLUE}→ Check the app logs above to see webhook events being processed${NC}"
echo -e "${BLUE}→ Look for: '[EVENT] Processing' and '[INVOICE PAID]' messages${NC}"
echo

read -p "Press ENTER after completing payment (or after 10 seconds)..."

# Step 5: Check subscription AFTER webhook
echo
echo -e "${YELLOW}[5/5] Checking subscription status AFTER webhook...${NC}"
AFTER=$(curl -s -X GET http://localhost:5050/subscriptions \
  -H "Authorization: Bearer $ACCESS_TOKEN")

PLAN_AFTER=$(echo "$AFTER" | jq -r '.data.plan // empty')
STATUS_AFTER=$(echo "$AFTER" | jq -r '.data.status // empty')

echo -e "Plan: ${YELLOW}$PLAN_AFTER${NC}"
echo -e "Status: ${YELLOW}$STATUS_AFTER${NC}"
echo -e "Full response:"
echo "$AFTER" | jq . | sed 's/^/  /'
echo

# Results
echo -e "${BLUE}========== TEST RESULTS ==========${NC}"
if [ "$PLAN_BEFORE" = "FREE" ] && [ "$PLAN_AFTER" = "PREMIUM" ]; then
  echo -e "${GREEN}✅ SUCCESS: User plan upgraded from FREE → PREMIUM${NC}"
  exit 0
elif [ "$PLAN_AFTER" = "PREMIUM" ]; then
  echo -e "${GREEN}✅ SUCCESS: User plan is PREMIUM${NC}"
  exit 0
else
  echo -e "${RED}❌ FAILED: User plan still $PLAN_AFTER (expected PREMIUM)${NC}"
  echo -e "${YELLOW}Check the app logs for webhook error messages${NC}"
  exit 1
fi
