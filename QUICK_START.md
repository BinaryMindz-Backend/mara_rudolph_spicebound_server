# 🚀 Quick Start Guide - Spicebound Server

## ⚡ 5-Minute Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Setup Database
```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 4. Start Development Server
```bash
npm run start:dev
```

Server runs on: **http://localhost:3000**

---

## 📖 API Quick Reference

### Health Check
```bash
curl http://localhost:3000
```

### Book Discovery
```bash
curl -X POST http://localhost:3000/book-slip/discover \
  -H "Content-Type: application/json" \
  -d '{"input": "Fourth Wing by Rebecca Yarros"}'
```

### Sign Up
```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "user@example.com",
    "password": "strongPassword123"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "strongPassword123"
  }'
```

### Get Current User (Protected)
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/auth/me
```

### Add Book to TBR (Protected)
```bash
curl -X POST http://localhost:3000/user-library/add \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bookId": "book-uuid",
    "status": "TBR"
  }'
```

### Get User's Library (Protected)
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/user-library
```

### Rate a Book (Protected)
```bash
curl -X POST http://localhost:3000/ratings/book-uuid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": 4.5}'
```

### Create Stripe Checkout (Protected)
```bash
curl -X POST http://localhost:3000/subscriptions/checkout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan": "monthly"}'
```

---

## 🏗️ Project Overview

**5 Core Modules:**

1. **Auth** - User registration, login, authentication
2. **BookSlip** - Book discovery with AI enrichment
3. **UserLibrary** - TBR management with drag & drop
4. **Rating** - Book ratings with aggregation
5. **Subscription** - Stripe payment integration

**Key Features:**
- ✅ Multi-source book search (Google Books, Open Library)
- ✅ AI-powered metadata enrichment (OpenAI)
- ✅ Free tier limits (3 books) / Premium unlimited
- ✅ Reading status tracking (TBR, Reading, Read, DNF)
- ✅ User ratings with half-star support
- ✅ Stripe subscription management
- ✅ Drag & drop book reordering

---

## 🛠️ Common Commands

```bash
# Development
npm run start:dev          # Start dev server
npm run build             # Build for production
npm run lint              # Run ESLint

# Testing
npm test                  # Run unit tests
npm run test:watch       # Watch mode
npm run test:cov         # Coverage report
npm run test:e2e         # E2E tests

# Database
npx prisma studio       # Visual DB browser
npx prisma migrate dev  # Create migration
npx prisma generate     # Generate client

# Format
npm run format           # Prettier format
```

---

## 📋 Required Environment Variables

Create `.env` file with:

```
DATABASE_URL=postgresql://user:password@localhost:5432/spicebound_dev
JWT_SECRET=your-secret-key-here
OPENAI_API_KEY=sk-your-key-here
GOOGLE_BOOKS_KEY=your-key-here
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_PRICE_MONTHLY_ID=price_xxx
STRIPE_PRICE_YEARLY_ID=price_xxx
FRONTEND_URL=http://localhost:3000
```

---

## 🎯 What's Implemented

### ✅ Complete
- [x] User authentication (signup, login, password change)
- [x] Book discovery with multi-source integration
- [x] AI-powered book enrichment (spice rating, tropes, etc.)
- [x] TBR management (add, remove, reorder)
- [x] Reading status tracking
- [x] User ratings system
- [x] Stripe integration
- [x] Free-tier limits
- [x] JWT security
- [x] Database schema
- [x] All controllers & services
- [x] Error handling
- [x] Input validation (DTOs)
- [x] TypeScript strict mode
- [x] Modular architecture

### ⚠️ Next Steps (For Frontend)
- Frontend application (React/Next.js)
- Search UI with multi-input support
- Book slip display component
- TBR list with drag & drop UI
- Authentication flow
- Subscription paywall
- Rating interface

---

## 🔍 Database Entities

```
Users
├── Library Items (UserBook)
│   └── Books
│       ├── Ratings (User ratings)
│       ├── Aliases (External IDs)
│       └── External ratings
└── Subscriptions

Books contain:
- Metadata (title, author, year, etc.)
- Enrichment (spice rating, tropes, creatures, subgenres)
- Series info
- Purchase links
- Ratings
```

---

## 🚨 Troubleshooting

**"Database connection failed"**
- Check PostgreSQL is running
- Verify DATABASE_URL is correct
- Run: `npx prisma db push`

**"Build errors"**
- Run: `npm run build`
- Check for TypeScript errors

**"AI enrichment not working"**
- Check OPENAI_API_KEY is set
- Verify OpenAI account has credits
- (Falls back gracefully if unavailable)

**"Stripe not working"**
- Use `stripe listen` in dev mode
- Verify webhook secret is set

---

## 📚 Full Documentation

See **IMPLEMENTATION_GUIDE.md** for complete documentation including:
- Full API endpoint reference
- Database schema details
- Architecture explanation
- Security considerations
- Deployment instructions
- Code organization

---

## 🎉 You're Ready!

```bash
npm install
npm run start:dev
```

API docs available at: **http://localhost:3000/api/docs** (Swagger)

Happy coding! 🚀
