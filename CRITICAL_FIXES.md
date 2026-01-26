# CRITICAL FIXES - ACTION ITEMS

**Time to implement all fixes: ~2 hours**

---

## 🔴 FIX #1: Add Combined Rating to Book Slip Response

**File:** [src/main/book-slip/book-slip.service.ts](src/main/book-slip/book-slip.service.ts)

**Current Code (Lines 205-220):**
```typescript
private buildSlip(book: any, created: boolean): BookSlipResponse {
  return {
    bookId: book.id,
    title: book.title,
    author: book.primaryAuthor,
    description: book.shortDescription,

    ageLevel: book.ageLevel,
    spiceRating: book.spiceRating,

    tropes: book.tropes ?? [],
    creatures: book.creatures ?? [],
    subgenres: book.subgenres ?? [],

    series: book.seriesName
      ? {
        name: book.seriesName,
        index: book.seriesIndex,
        total: book.seriesTotal,
        status: book.seriesStatus,
      }
      : undefined,

    externalRatings: {
      average: book.externalAvgRating,
      count: book.externalRatingCount,
    },

    links: {
      amazon: book.amazonUrl,
      bookshop: book.bookshopUrl,
    },

    created,
  };
}
```

**Action Required:**

1. **Import the rating utility** at the top of book-slip.service.ts:
```typescript
import { calculateCombinedRating } from '../../common/utils/rating-utils.js';
```

2. **Update buildSlip() method:**
```typescript
private buildSlip(book: any, created: boolean): BookSlipResponse {
  // Calculate combined rating
  const combinedRating = calculateCombinedRating(
    book.externalAvgRating,
    book.externalRatingCount,
    book.spiceboundAvgRating,
    book.spiceboundRatingCount,
  );

  return {
    bookId: book.id,
    title: book.title,
    author: book.primaryAuthor,
    description: book.shortDescription,

    ageLevel: book.ageLevel,
    spiceRating: book.spiceRating,

    tropes: book.tropes ?? [],
    creatures: book.creatures ?? [],
    subgenres: book.subgenres ?? [],

    series: book.seriesName
      ? {
        name: book.seriesName,
        index: book.seriesIndex,
        total: book.seriesTotal,
        status: book.seriesStatus,
      }
      : undefined,

    externalRatings: {
      average: book.externalAvgRating,
      count: book.externalRatingCount,
    },

    spiceboundRatings: {
      average: book.spiceboundAvgRating,
      count: book.spiceboundRatingCount,
    },

    combinedRating: {
      display: combinedRating.display,
      value: combinedRating.value,
      sources: combinedRating.sources,
    },

    links: {
      amazon: book.amazonUrl,
      bookshop: book.bookshopUrl,
    },

    created,
  };
}
```

3. **Update BookSlipResponse interface** in [src/main/book-slip/dto/book-slip.response.ts](src/main/book-slip/dto/book-slip.response.ts):
```typescript
export interface BookSlipResponse {
  bookId: string;
  title: string;
  author: string;
  description?: string;

  ageLevel?: AgeLevel;
  spiceRating?: number;

  tropes: string[];
  creatures: string[];
  subgenres: string[];

  series?: {
    name: string;
    index: number;
    total?: number;
    status: SeriesStatus;
  };

  externalRatings?: {
    average?: number;
    count?: number;
  };

  spiceboundRatings?: {
    average?: number;
    count?: number;
  };

  combinedRating?: {
    display: string;
    value: number | null;
    sources: string[];
  };

  links?: {
    amazon?: string;
    bookshop?: string;
  };

  created: boolean;
}
```

**Time:** 15 minutes

---

## 🔴 FIX #2: Enable Stripe Webhook Signature Verification

**File:** [src/main/subscription/subscription.service.ts](src/main/subscription/subscription.service.ts)

**Current Code (Lines 91-109):**
```typescript
async handleWebhook(event: any): Promise<void> {
  if (!this.stripe) {
    throw new BadRequestException('Stripe not configured');
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionCanceled(event.data.object);
        break;

      case 'payment_intent.succeeded':
        this.logger.log('Payment succeeded');
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    this.logger.error('Webhook handling failed', error);
    throw error;
  }
}
```

**Action Required:**

1. **Update method signature** to accept raw request:
```typescript
async handleWebhook(rawBody: string, signature: string): Promise<void> {
  if (!this.stripe) {
    throw new BadRequestException('Stripe not configured');
  }

  const webhookSecret = this.configService.get<string>('stripe.webhookSecret');
  
  if (!webhookSecret) {
    throw new BadRequestException('Webhook secret not configured');
  }

  // Verify Stripe signature
  let event;
  try {
    event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (error) {
    this.logger.error('Webhook signature verification failed', error);
    throw new BadRequestException(`Webhook signature verification failed: ${error.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionCanceled(event.data.object);
        break;

      case 'payment_intent.succeeded':
        this.logger.log('Payment succeeded');
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    this.logger.error('Webhook handling failed', error);
    throw error;
  }
}
```

2. **Update controller** in [src/main/subscription/subscription.controller.ts](src/main/subscription/subscription.controller.ts):
```typescript
@Post('webhook')
async handleWebhook(@Req() req: any) {
  const signature = req.headers['stripe-signature'];
  const rawBody = req.rawBody || JSON.stringify(req.body);
  
  if (!signature) {
    throw new BadRequestException('Missing Stripe signature header');
  }

  await this.subscriptionService.handleWebhook(rawBody, signature);
  return { received: true };
}
```

3. **Configure raw body middleware** in [src/main.ts](src/main.ts):
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Enable raw body for Stripe webhook verification
    rawBody: true,
  });

  // Rest of configuration...
}
```

**Time:** 20 minutes

---

## 🔴 FIX #3: Configure Stripe Account & Environment Variables

**Files:** `.env.production` (create or update)

**Action Required:**

### Step 1: Create/Update Stripe Account
1. Go to https://stripe.com
2. Sign up or log in
3. Navigate to **Developers** → **API Keys**
4. Copy **Secret Key** (starts with `sk_test_` for test mode)
5. Copy **Publishable Key** (starts with `pk_test_`)

### Step 2: Create Price Objects
1. Go to **Products** → **Create Product**
2. **Product 1: Monthly Plan**
   - Name: "Spicebound Premium - Monthly"
   - Price: $15.00 USD
   - Billing period: Monthly
   - Copy the `price_xxxxx` ID
3. **Product 2: Yearly Plan**
   - Name: "Spicebound Premium - Yearly"
   - Price: $120.00 USD
   - Billing period: Yearly
   - Copy the `price_xxxxx` ID

### Step 3: Get Webhook Secret
1. Go to **Developers** → **Webhooks**
2. Add endpoint: `https://readspicebound.com/subscriptions/webhook`
3. Select events: 
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `payment_intent.succeeded`
4. Copy the **Signing Secret** (starts with `whsec_`)

### Step 4: Update `.env.production`
```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_PRICE_MONTHLY_ID=price_1ABC123XYZ...
STRIPE_PRICE_YEARLY_ID=price_2DEF456ABC...
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Frontend URL for redirects
FRONTEND_URL=https://readspicebound.com
```

### Step 5: Verify Configuration in Code

Check [src/config/stripe.config.ts](src/config/stripe.config.ts):
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('stripe', () => ({
  secretKey: process.env.STRIPE_SECRET_KEY,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  priceMonthly: process.env.STRIPE_PRICE_MONTHLY_ID,
  priceYearly: process.env.STRIPE_PRICE_YEARLY_ID,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
}));
```

Make sure it's imported in [src/config/index.ts](src/config/index.ts):
```typescript
import stripeConfig from './stripe.config.js';

export default [
  jwtConfig,
  openaiConfig,
  stripeConfig,
];
```

**Time:** 30 minutes - 1 hour (depends on Stripe account status)

---

## ⚠️ IMPROVEMENT #1: Implement Email Service

**File:** [src/common/services/email.service.ts](src/common/services/email.service.ts)

**Currently:** Exists but not fully implemented

**Option A: SendGrid (Recommended for Production)**

1. **Sign up at SendGrid:** https://sendgrid.com
2. **Get API Key:** Settings → API Keys → Create API Key
3. **Install package:**
```bash
npm install @sendgrid/mail
```

4. **Update `.env.production`:**
```bash
SENDGRID_API_KEY=SG.your_api_key_here
SENDGRID_FROM_EMAIL=noreply@readspicebound.com
```

5. **Implement email service:**
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

@Injectable()
export class EmailService {
  constructor(private configService: ConfigService) {
    sgMail.setApiKey(this.configService.get<string>('SENDGRID_API_KEY'));
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
  ): Promise<void> {
    const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${resetToken}`;

    const msg = {
      to: email,
      from: this.configService.get<string>('SENDGRID_FROM_EMAIL'),
      subject: 'Reset Your Spicebound Password',
      html: `
        <h1>Password Reset Request</h1>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, ignore this email.</p>
      `,
    };

    await sgMail.send(msg);
  }

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const msg = {
      to: email,
      from: this.configService.get<string>('SENDGRID_FROM_EMAIL'),
      subject: 'Welcome to Spicebound!',
      html: `
        <h1>Welcome to Spicebound, ${name}!</h1>
        <p>Start discovering your next favorite romance book.</p>
        <a href="${this.configService.get('FRONTEND_URL')}">Go to Spicebound</a>
      `,
    };

    await sgMail.send(msg);
  }
}
```

**Time:** 1-2 hours

---

## ⚠️ IMPROVEMENT #2: Fix HTTP Status Codes

**File:** [src/main/user-library/user-library.controller.ts](src/main/user-library/user-library.controller.ts)

**Current Issue:** POST endpoints should return 201, not 200

**Action Required:**

```typescript
import { HttpCode } from '@nestjs/common';

@Controller('user-library')
@UseGuards(JwtAuthGuard)
export class UserLibraryController {
  constructor(private readonly userLibraryService: UserLibraryService) {}

  @Post('add')
  @HttpCode(201)  // ADD THIS LINE
  async addBook(
    @CurrentUser() userId: string,
    @Body() dto: AddBookToLibraryDto,
  ) {
    return this.userLibraryService.addBookToLibrary(userId, dto);
  }

  // ... rest of methods
}
```

Do the same for:
- [src/main/rating/rating.controller.ts](src/main/rating/rating.controller.ts) - `@Post(':bookId')`
- [src/main/subscription/subscription.controller.ts](src/main/subscription/subscription.controller.ts) - `@Post('checkout')`

**Time:** 10 minutes

---

## ⚠️ IMPROVEMENT #3: Add CORS Configuration

**File:** [src/main.ts](src/main.ts)

**Action Required:**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // For Stripe webhooks
  });

  // Configure CORS
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [
        'https://readspicebound.com',
        'https://www.readspicebound.com',
      ]
    : ['http://localhost:3000', 'http://localhost:3001'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
  });

  // Rest of configuration...
  await app.listen(process.env.PORT || 3000);
}

bootstrap();
```

**Time:** 10 minutes

---

## Summary of Changes

### Critical (Must Do)
- [ ] FIX #1: Add combined rating (15 min) ← **DO FIRST**
- [ ] FIX #2: Enable webhook verification (20 min) ← **DO SECOND**
- [ ] FIX #3: Configure Stripe (30-60 min) ← **DO THIRD**

### Important (Should Do Before Launch)
- [ ] IMP #1: Implement email service (1-2 hours)
- [ ] IMP #2: Fix HTTP 201 status codes (10 min)
- [ ] IMP #3: Add CORS configuration (10 min)

### Total Time to Production-Ready
- **Critical Fixes:** 1 hour 15 minutes
- **Important Fixes:** 1 hour 30 minutes
- **Testing:** 2 hours
- **Total: ~5 hours**

---

## Testing After Fixes

```bash
# Test book slip with combined rating
curl -X POST http://localhost:3000/book-slip/discover \
  -H "Content-Type: application/json" \
  -d '{"input": "Fourth Wing by Rebecca Yarros"}'

# Verify response includes combinedRating field

# Test subscription with Stripe
curl -X POST http://localhost:3000/subscriptions/checkout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan": "monthly"}'

# Verify you get sessionId and url

# Test webhook locally with Stripe CLI
stripe listen --forward-to localhost:3000/subscriptions/webhook
stripe trigger customer.subscription.created
```

---

**Priority Order:** FIX #3 → FIX #1 → FIX #2 → IMP #1 → IMP #2, #3

**Estimated Total Time:** 5 hours to full production readiness
