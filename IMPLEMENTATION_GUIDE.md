# Spicebound Server - MVP Implementation

A complete NestJS backend for the Spicebound platform - a fantasy romance book discovery and TBR management application.

## 📋 Table of Contents

- [Project Structure](#project-structure)
- [Core Features](#core-features)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Running the Server](#running-the-server)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Architecture](#architecture)

---

## 🏗️ Project Structure

```
src/
├── app.module.ts                    # Root module with all imports
├── app.controller.ts                # Health check endpoint
├── app.service.ts
├── main/
│   ├── auth/                        # Authentication module
│   │   ├── auth.controller.ts       # Login, signup, me, change-password
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts
│   │   └── dto/
│   │       ├── signup.dto.ts
│   │       ├── login.dto.ts
│   │       └── change-password.dto.ts
│   │
│   ├── book-slip/                   # Book discovery & metadata enrichment
│   │   ├── book-slip.controller.ts  # POST /book-slip/discover
│   │   ├── book-slip.service.ts     # Core discovery logic
│   │   ├── book-slip.module.ts
│   │   ├── providers/
│   │   │   ├── google-books.provider.ts
│   │   │   └── open-library.provider.ts
│   │   ├── ai/
│   │   │   ├── ai-enrichment.service.ts  # LLM integration for metadata
│   │   │   ├── enrich-book.prompt.ts
│   │   │   └── enrich-book.schema.ts
│   │   ├── utils/
│   │   │   ├── input-detector.ts
│   │   │   ├── isbn-normalizer.ts
│   │   │   ├── url-normalizer.ts
│   │   │   └── merge-book-data.ts
│   │   ├── types/
│   │   │   └── book-source.types.ts
│   │   └── dto/
│   │       ├── discover-book.dto.ts
│   │       └── book-slip.response.ts
│   │
│   ├── user-library/                # TBR management
│   │   ├── user-library.controller.ts  # Add/remove, reorder, status
│   │   ├── user-library.service.ts
│   │   ├── user-library.module.ts
│   │   └── dto/
│   │       ├── add-book-to-library.dto.ts
│   │       ├── update-book-status.dto.ts
│   │       └── reorder-books.dto.ts
│   │
│   ├── rating/                      # Book ratings
│   │   ├── rating.controller.ts     # Rate, get ratings
│   │   ├── rating.service.ts
│   │   ├── rating.module.ts
│   │   └── dto/
│   │       └── create-rating.dto.ts
│   │
│   ├── subscription/                # Stripe integration
│   │   ├── subscription.controller.ts  # Checkout, webhook, status
│   │   ├── subscription.service.ts
│   │   ├── subscription.module.ts
│   │   └── dto/
│   │
│   └── prisma/
│       ├── prisma.service.ts
│       └── prisma.module.ts
│
├── common/
│   ├── decorators/
│   │   └── user.decorators.ts       # @CurrentUser() decorator
│   ├── guards/
│   │   └── jwt-auth.guard.ts
│   ├── constants/
│   │   ├── tropes.ts                # Approved romance tropes list
│   │   ├── spice-rating.ts          # Spice rating scale (0-6)
│   │   └── index.ts
│   └── utils/
│       ├── rating-utils.ts          # Combined rating calculation
│       ├── subscription-utils.ts    # Tier limits logic
│       ├── url-helper.ts            # Affiliate link helpers
│       └── index.ts
│
└── config/
    ├── stripe.config.ts             # Stripe configuration
    ├── jwt.config.ts                # JWT configuration
    ├── openai.config.ts             # OpenAI configuration
    └── index.ts

prisma/
├── schema.prisma                    # Database schema
└── migrations/                      # Database migrations
```

---

## ✨ Core Features

### 1. **Book Discovery (Book Slip)**
- Accept multiple input formats:
  - Amazon URLs
  - Goodreads URLs
  - Free text (title/author)
  - ISBN codes
- Multi-source book data integration:
  - Google Books API
  - Open Library API
- AI-powered enrichment:
  - Automatic spice rating (0-6)
  - Romance trope detection (40+ approved tropes)
  - Age level classification
  - Creature & subgenre tagging
- Intelligent deduplication using normalized title+author
- Comprehensive metadata response with ratings, series info, and affiliate links

### 2. **Authentication**
- Email + password signup
- JWT-based login
- Secure password hashing with bcrypt
- Change password endpoint
- Current user profile endpoint
- Plan-based user model (FREE/PREMIUM)

### 3. **TBR & Reading Status Management**
- Add/remove books from library
- Reading status tracking: TBR, READING, READ, DNF
- Drag-and-drop reordering support
- Free-tier limits (max 3 books for free users)
- Premium unlimited books
- User ratings (0-5 with half-star support)

### 4. **Rating System**
- Per-user book ratings (0-5, half-star increments)
- Aggregated spicebound ratings
- Combined rating calculation:
  - Weighted blend of external + spicebound ratings
  - Minimum 10 ratings threshold to display
  - Fallback to single source if only one available

### 5. **Subscription & Payment (Stripe)**
- Monthly ($15) and yearly ($120 = $10/mo) plans
- Checkout session creation
- Webhook handling for subscription events
- Automatic user plan upgrade/downgrade
- Downgrade impact checking
- Free tier with 3-book limit
- Premium tier with unlimited books

---

## 🚀 Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- npm or yarn

### Setup

1. **Clone repository and install dependencies**
   ```bash
   git clone <repo-url>
   cd mara_rudolph_spicebound_server
   npm install
   ```

2. **Copy environment template**
   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables** (see [Environment Setup](#environment-setup))

4. **Setup database**
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

5. **Build**
   ```bash
   npm run build
   ```

---

## 🔧 Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/spicebound_dev

# JWT
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=24h

# Stripe
STRIPE_SECRET_KEY=sk_test_your_test_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key_here
STRIPE_PRICE_MONTHLY_ID=price_1234567890
STRIPE_PRICE_YEARLY_ID=price_0987654321
STRIPE_WEBHOOK_SECRET=whsec_test_secret

# OpenAI (for book enrichment)
OPENAI_API_KEY=sk-your-openai-key-here
OPENAI_MODEL=gpt-4

# Google Books API
GOOGLE_BOOKS_KEY=your_google_books_api_key

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

### Getting API Keys

**OpenAI:**
- Visit https://platform.openai.com/api-keys
- Create a new API key

**Google Books:**
- Go to Google Cloud Console
- Enable Books API
- Create API key

**Stripe:**
- Create account at https://stripe.com
- Get test keys from Dashboard
- Create price IDs for monthly/yearly plans

---

## ▶️ Running the Server

### Development
```bash
npm run start:dev
```
Server runs on `http://localhost:3000`

### Production
```bash
npm run build
npm run start:prod
```

### Testing
```bash
npm test              # Unit tests
npm run test:watch   # Watch mode
npm run test:cov     # Coverage report
npm run test:e2e     # E2E tests
```

### Database Operations
```bash
npx prisma studio      # Visual DB browser
npx prisma migrate dev # Create new migration
npx prisma db seed     # Run seed file (if created)
```

---

## 📡 API Endpoints

### Authentication
- `POST /auth/signup` - Register new user
- `POST /auth/login` - Login with email/password
- `GET /auth/me` - Get current user (protected)
- `POST /auth/change-password` - Change password (protected)

### Book Discovery
- `POST /book-slip/discover` - Search for book and get Book Slip
  - Input: ISBN, Amazon URL, Goodreads URL, or free text
  - Output: Complete book metadata with enrichment

### User Library / TBR
- `POST /user-library/add` - Add book to TBR (protected)
- `GET /user-library` - Get user's library (protected)
- `GET /user-library?status=READING` - Filter by status (protected)
- `GET /user-library/count` - Get book count (protected)
- `PUT /user-library/:bookId/status` - Update reading status (protected)
- `PUT /user-library/reorder` - Reorder books (protected)
- `DELETE /user-library/:bookId` - Remove from library (protected)

### Ratings
- `POST /ratings/:bookId` - Rate a book (protected)
- `GET /ratings/:bookId` - Get book's aggregated rating
- `GET /ratings/user/:bookId` - Get user's rating for book (protected)
- `DELETE /ratings/:bookId` - Remove user's rating (protected)

### Subscriptions
- `POST /subscriptions/checkout` - Create Stripe checkout (protected)
- `GET /subscriptions` - Get user's subscription (protected)
- `GET /subscriptions/downgrade-impact` - Check downgrade impact (protected)
- `POST /subscriptions/webhook` - Stripe webhook handler

---

## 🗄️ Database Schema

### Key Tables

**Users**
- `id` (UUID)
- `name` (string)
- `email` (string, unique)
- `password` (bcrypt hash)
- `plan` (ENUM: FREE, PREMIUM)
- `stripeCustomerId` (optional)
- `createdAt`, `updatedAt`

**Books**
- `id` (UUID)
- `title`, `normalizedTitle`
- `primaryAuthor`, `normalizedAuthor`
- `ageLevel` (ENUM: CHILDREN, YA, NA, ADULT, EROTICA)
- `spiceRating` (0-6)
- `tropes`, `creatures`, `subgenres` (string arrays)
- `seriesName`, `seriesIndex`, `seriesTotal`, `seriesStatus`
- `shortDescription`
- `externalAvgRating`, `externalRatingCount`
- `spiceboundAvgRating`, `spiceboundRatingCount`
- `amazonUrl`, `bookshopUrl`, `amazonAffiliateUrl`, `bookshopAffiliateUrl`
- `coverImageUrl`
- `createdAt`, `updatedAt`

**BookAlias**
- `id` (UUID)
- `type` (ENUM: ISBN_10, ISBN_13, GOOGLE_VOLUME_ID, OPEN_LIBRARY_ID, ASIN, GOODREADS_ID)
- `value` (string)
- `bookId` (FK)
- Unique constraint on (type, value)

**UserBook**
- `id` (UUID)
- `userId` (FK)
- `bookId` (FK)
- `status` (ENUM: TBR, READING, READ, DNF)
- `orderIndex` (int)
- `rating` (float, 0-5)
- Unique constraint on (userId, bookId)

**Ratings**
- `id` (UUID)
- `userId` (FK)
- `bookId` (FK)
- `value` (float)
- Unique constraint on (userId, bookId)

**Subscriptions**
- `id` (CUID)
- `userId` (FK)
- `stripeCustomerId` (string)
- `stripeSubscriptionId` (string)
- `plan` (ENUM: FREE, PREMIUM)
- `status` (string)
- `createdAt`, `updatedAt`

---

## 🏛️ Architecture

### Layered Architecture
```
Controllers
    ↓
Services (business logic)
    ↓
Providers (external APIs)
    ↓
Prisma (ORM)
    ↓
PostgreSQL (database)
```

### Module Structure
- **Feature Modules**: Auth, BookSlip, UserLibrary, Rating, Subscription
- **Infrastructure**: Prisma, ConfigModule
- **Common**: Guards, Decorators, Constants, Utils

### Key Design Patterns

**1. Dependency Injection**
- All services injected via NestJS DI container
- Loose coupling between modules

**2. Data Transfer Objects (DTOs)**
- All input validated with class-validator
- API contract clarity

**3. Guards & Decorators**
- JwtAuthGuard for protected routes
- @CurrentUser decorator for userId extraction
- Reusable auth logic

**4. Provider Pattern**
- GoogleBooksProvider & OpenLibraryProvider for multi-source integration
- Easy to extend with new sources

**5. AI Enrichment**
- OpenAI GPT-4 for metadata enrichment
- Controlled vocabulary validation
- Graceful fallback if AI unavailable

---

## 📚 Key Business Logic

### Book Deduplication
1. Try to find by ISBN-13 (most reliable)
2. Fallback to normalized title + author match
3. Create new book if no match found
4. Store all external IDs as aliases

### Free-Tier Limits
- Free users: max 3 books in TBR
- Attempting to add 4th book triggers upgrade paywall
- Premium users have unlimited books
- Downgrade check: users with >3 books can't downgrade without removing books

### Combined Ratings
- Minimum 10 ratings threshold to display
- If both sources available: 60% external + 40% spicebound
- If only one source: use that source
- If insufficient ratings: display "–"

### Reading Status Flow
```
TBR (default)
  ↓ (manual change)
READING (prioritized at top)
  ↓ (manual change)
READ or DNF (moved to separate sections)
```

---

## 🔐 Security Considerations

1. **Password Security**
   - Bcrypt hashing with salt rounds 12
   - Never return password in API responses

2. **JWT Tokens**
   - Signed with secret key
   - 24h expiration (configurable)
   - Contains sub (user ID), email, plan

3. **Database**
   - Prisma parameterized queries prevent SQL injection
   - Relationships validated at DB level

4. **Stripe Webhooks**
   - Verify webhook signature (production)
   - Idempotent processing

5. **Rate Limiting**
   - Recommended to add middleware for prod

---

## 🐛 Troubleshooting

**Build errors after adding packages?**
```bash
npm run build
```

**Database connection issues?**
- Verify DATABASE_URL format
- Check PostgreSQL is running
- Run: `npx prisma db push`

**AI enrichment not working?**
- Verify OPENAI_API_KEY is set
- Check OpenAI account has credits
- Service gracefully falls back if unavailable

**Stripe webhook not firing?**
- Use stripe-cli in dev: `stripe listen --forward-to localhost:3000/subscriptions/webhook`
- In production: configure endpoint in Stripe Dashboard

---

## 📦 Dependencies

Key packages:
- `@nestjs/*` - NestJS framework
- `@prisma/client` - ORM
- `bcrypt` - Password hashing
- `stripe` - Stripe SDK
- `class-validator` - DTO validation
- `@nestjs/jwt` - JWT authentication
- `@nestjs/config` - Configuration management

---

## 🚀 Deployment

### Production Checklist
- [ ] Update JWT_SECRET to strong random value
- [ ] Set up Stripe production keys
- [ ] Configure OpenAI production key
- [ ] Set up PostgreSQL production database
- [ ] Set FRONTEND_URL to production domain
- [ ] Enable HTTPS
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure rate limiting
- [ ] Enable Stripe webhook signature verification
- [ ] Set up database backups
- [ ] Configure environment variables on production server

### Docker Deployment
Create `Dockerfile` (provided in root):
```bash
docker build -t spicebound-server .
docker run -p 3000:3000 --env-file .env spicebound-server
```

---

## 📝 Contributing

1. Create feature branch: `git checkout -b feature/xyz`
2. Make changes
3. Test: `npm run test`
4. Build: `npm run build`
5. Commit with clear messages
6. Push and create PR

---

## 📄 License

Proprietary - Spicebound MVP

---

## 📞 Support

For issues, documentation, or questions:
- Check `.env.example` for configuration
- Review API endpoint documentation above
- Check Prisma schema for database structure
- Run `npm run start:dev` for development

