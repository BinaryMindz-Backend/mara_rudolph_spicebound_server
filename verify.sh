#!/bin/bash
# Spicebound Server - Verification Script
# This script verifies the installation and setup

echo "🔍 Spicebound Server - Verification Check"
echo "=========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
echo -n "✓ Checking Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}${NODE_VERSION}${NC}"
else
    echo -e "${RED}Not found${NC}"
fi

# Check npm
echo -n "✓ Checking npm... "
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}${NPM_VERSION}${NC}"
else
    echo -e "${RED}Not found${NC}"
fi

# Check PostgreSQL
echo -n "✓ Checking PostgreSQL... "
if command -v psql &> /dev/null; then
    echo -e "${GREEN}installed${NC}"
else
    echo -e "${YELLOW}not found (required)${NC}"
fi

# Check Prisma
echo -n "✓ Checking Prisma... "
if [ -d "node_modules/@prisma" ]; then
    echo -e "${GREEN}installed${NC}"
else
    echo -e "${RED}not installed${NC}"
fi

# Check key files
echo -n "✓ Checking .env file... "
if [ -f ".env" ]; then
    echo -e "${GREEN}found${NC}"
else
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}not found (run: cp .env.example .env)${NC}"
    else
        echo -e "${RED}not found${NC}"
    fi
fi

# Check TypeScript compilation
echo -n "✓ Checking TypeScript build... "
if npm run build 2>/dev/null | grep -q "compiled successfully"; then
    echo -e "${GREEN}ok${NC}"
elif npm run build 2>&1 | tail -5 | grep -q "dist/main.js"; then
    echo -e "${GREEN}ok${NC}"
else
    echo -e "${RED}failed${NC}"
fi

echo ""
echo "=========================================="
echo "Setup Steps:"
echo "1. cp .env.example .env"
echo "2. Edit .env with your credentials"
echo "3. npx prisma generate"
echo "4. npx prisma migrate dev"
echo "5. npm run start:dev"
echo ""
echo "For more info, see QUICK_START.md"
