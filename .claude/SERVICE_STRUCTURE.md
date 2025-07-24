---
title: Service Structure Standards
description: Standardized patterns for API domain organization
created: 2024-07-24
updated: 2024-07-24
type: architecture
---

# Service Structure Standards

Every API domain MUST follow this exact structure for LLM comprehension and consistency.

## Standard Domain Structure

```
src/{domain}/
├── router.ts         # Express routes and HTTP handling
├── service.ts        # Business logic and orchestration
├── repository.ts     # Database queries and data access
├── validators.ts     # Input validation schemas
├── types.ts         # Domain-specific types
├── errors.ts        # Domain-specific error classes
└── __tests__/       # All tests for this domain
    ├── router.test.ts
    ├── service.test.ts
    ├── repository.test.ts
    └── integration.test.ts
```

## File Responsibilities

### router.ts
- HTTP route definitions
- Request/response handling
- Authentication middleware
- Input validation
- Error handling

```typescript
/**
 * Payment routes for Stripe checkout and webhook handling.
 * 
 * @description Handles all payment-related HTTP endpoints:
 * - POST /checkout - Create Stripe checkout session
 * - POST /webhook - Process Stripe webhooks
 * - GET /status/:id - Check payment status
 */

import { Router } from 'express';
import { requireAuth, AuthRequest } from '../auth/middleware';
import { PaymentService } from './service';
import { validateCheckoutRequest } from './validators';

const router = Router();
const paymentService = new PaymentService();

/**
 * Create Stripe checkout session for lesson purchase.
 * 
 * @route POST /api/payments/checkout
 * @access Private (requires authentication)
 */
router.post('/checkout', requireAuth, validateCheckoutRequest, async (req: AuthRequest, res, next) => {
  try {
    const { lessonId } = req.body;
    const userId = req.user!.uid;
    
    const session = await paymentService.createCheckoutSession(lessonId, userId);
    
    res.json({
      data: {
        sessionId: session.id,
        sessionUrl: session.url
      }
    });
  } catch (error) {
    next(error);
  }
});

export { router as paymentRouter };
```

### service.ts
- Business logic implementation
- External service integration
- Data transformation
- Transaction orchestration

```typescript
/**
 * Payment service for handling Stripe integration and purchase flow.
 * 
 * @description Manages the complete payment lifecycle:
 * - Creates checkout sessions with proper metadata
 * - Processes webhooks and updates purchase records
 * - Calculates platform fees and instructor earnings
 * - Handles refunds and disputes
 */

import Stripe from 'stripe';
import { PaymentRepository } from './repository';
import { LessonRepository } from '../lessons/repository';
import { calculatePlatformFee, calculateInstructorEarnings } from '@teach-niche/utils';
import { PaymentNotFoundError, InvalidPaymentError } from './errors';

export class PaymentService {
  private stripe: Stripe;
  private paymentRepo: PaymentRepository;
  private lessonRepo: LessonRepository;
  
  constructor(
    paymentRepo = new PaymentRepository(),
    lessonRepo = new LessonRepository()
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-12-18.acacia'
    });
    this.paymentRepo = paymentRepo;
    this.lessonRepo = lessonRepo;
  }
  
  /**
   * Creates Stripe checkout session for lesson purchase.
   * 
   * @param lessonId - UUID of lesson to purchase
   * @param userId - Firebase UID of purchasing user
   * @returns Stripe checkout session with payment URL
   * 
   * @throws {LessonNotFoundError} When lesson doesn't exist
   * @throws {LessonNotPublishedError} When lesson is unpublished
   * @throws {AlreadyPurchasedError} When user already owns lesson
   */
  async createCheckoutSession(lessonId: string, userId: string): Promise<Stripe.Checkout.Session> {
    // Verify lesson exists and is purchasable
    const lesson = await this.lessonRepo.findById(lessonId);
    if (!lesson || !lesson.published) {
      throw new InvalidPaymentError('Lesson not available for purchase');
    }
    
    // Check if already purchased
    const existingPurchase = await this.paymentRepo.findPurchase(userId, lessonId);
    if (existingPurchase) {
      throw new InvalidPaymentError('Lesson already purchased');
    }
    
    const platformFee = calculatePlatformFee(lesson.price);
    
    return await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: lesson.title,
            description: lesson.description || undefined,
          },
          unit_amount: lesson.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/lessons/${lessonId}?purchase=success`,
      cancel_url: `${process.env.FRONTEND_URL}/lessons/${lessonId}`,
      metadata: {
        userId,
        lessonId,
        instructorId: lesson.instructorId
      },
      payment_intent_data: {
        application_fee_amount: platformFee,
        metadata: { userId, lessonId }
      }
    });
  }
}
```

### repository.ts
- Database access layer
- Query implementation
- Data mapping
- Transaction management

```typescript
/**
 * Payment repository for database operations.
 * 
 * @description Handles all payment-related database queries:
 * - Purchase record creation and retrieval
 * - Payment status updates
 * - Instructor earnings calculations
 * - Payout tracking
 */

import prisma, { Purchase, PurchaseStatus } from '@teach-niche/database';
import { PurchaseCreateData, PurchaseFilters } from './types';

export class PaymentRepository {
  /**
   * Creates a new purchase record in the database.
   * 
   * @param data - Purchase creation data with required fields
   * @returns Created purchase record
   * 
   * @throws {DatabaseError} When creation fails
   */
  async createPurchase(data: PurchaseCreateData): Promise<Purchase> {
    return await prisma.purchase.create({
      data: {
        userId: data.userId,
        lessonId: data.lessonId,
        amount: data.amount,
        platformFee: data.platformFee,
        instructorEarnings: data.instructorEarnings,
        stripePaymentIntentId: data.stripePaymentIntentId,
        status: 'PENDING'
      },
      include: {
        user: true,
        lesson: {
          include: {
            instructor: true
          }
        }
      }
    });
  }
  
  /**
   * Finds existing purchase by user and lesson.
   * 
   * @param userId - Firebase UID of user
   * @param lessonId - UUID of lesson
   * @returns Purchase record or null if not found
   */
  async findPurchase(userId: string, lessonId: string): Promise<Purchase | null> {
    return await prisma.purchase.findUnique({
      where: {
        userId_lessonId: {
          userId,
          lessonId
        }
      }
    });
  }
  
  /**
   * Updates purchase status.
   * 
   * @param id - Purchase UUID
   * @param status - New status
   * @returns Updated purchase record
   */
  async updateStatus(id: string, status: PurchaseStatus): Promise<Purchase> {
    return await prisma.purchase.update({
      where: { id },
      data: { 
        status,
        updatedAt: new Date()
      }
    });
  }
}
```

### validators.ts
- Input validation schemas
- Request sanitization
- Type coercion
- Error formatting

```typescript
/**
 * Payment request validators using Zod schemas.
 * 
 * @description Validates all payment-related API inputs:
 * - Checkout request validation
 * - Webhook signature verification
 * - Payment status queries
 */

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@teach-niche/utils';

const checkoutRequestSchema = z.object({
  body: z.object({
    lessonId: z.string().uuid('Invalid lesson ID format'),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional()
  })
});

/**
 * Validates checkout request body.
 * 
 * @param req - Express request object
 * @param res - Express response object  
 * @param next - Next middleware function
 * 
 * @throws {ValidationError} When validation fails
 */
export function validateCheckoutRequest(req: Request, res: Response, next: NextFunction) {
  try {
    checkoutRequestSchema.parse(req);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        'Invalid checkout request',
        error.errors
      );
    }
    throw error;
  }
}
```

### types.ts
- Domain-specific interfaces
- Request/response types
- Business logic types
- Database model extensions

```typescript
/**
 * Payment domain types and interfaces.
 * 
 * @description All payment-related TypeScript types:
 * - API request/response interfaces  
 * - Database record types
 * - Business logic types
 * - External service types
 */

export interface CheckoutRequest {
  lessonId: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutResponse {
  sessionId: string;
  sessionUrl: string;
}

export interface PurchaseCreateData {
  userId: string;
  lessonId: string;
  amount: number;
  platformFee: number;
  instructorEarnings: number;
  stripePaymentIntentId: string;
}

export interface PaymentWebhookData {
  type: string;
  data: {
    object: any;
  };
}

export interface InstructorEarnings {
  totalEarnings: number;
  pendingEarnings: number;
  completedPayouts: number;
  nextPayoutDate: Date;
}
```

### errors.ts
- Domain-specific error classes
- Consistent error formatting
- HTTP status code mapping
- Error context preservation

```typescript
/**
 * Payment domain error classes.
 * 
 * @description Standardized errors for payment operations:
 * - Extends base AppError with domain context
 * - Maps to appropriate HTTP status codes
 * - Preserves error context for debugging
 */

import { AppError } from '@teach-niche/utils';

export class PaymentNotFoundError extends AppError {
  constructor(paymentId: string) {
    super(404, `Payment ${paymentId} not found`, 'PAYMENT_NOT_FOUND');
  }
}

export class InvalidPaymentError extends AppError {
  constructor(message: string) {
    super(400, message, 'INVALID_PAYMENT');
  }
}

export class AlreadyPurchasedError extends AppError {
  constructor(lessonId: string) {
    super(409, `Lesson ${lessonId} already purchased`, 'ALREADY_PURCHASED');
  }
}

export class StripeWebhookError extends AppError {
  constructor(message: string) {
    super(400, `Webhook error: ${message}`, 'STRIPE_WEBHOOK_ERROR');
  }
}
```

## Mandatory Health Endpoints

Every service domain should expose these endpoints:

```typescript
// Add to each router.ts
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'payments',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0'
  });
});

router.get('/info', (req, res) => {
  res.json({
    service: 'payments',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV,
    features: ['stripe-checkout', 'webhooks', 'payouts']
  });
});

router.get('/metrics', (req, res) => {
  // Prometheus-compatible metrics
  res.set('Content-Type', 'text/plain');
  res.send(`
# HELP payments_total Total number of payments processed
# TYPE payments_total counter
payments_total 0

# HELP payments_errors_total Total payment errors
# TYPE payments_errors_total counter  
payments_errors_total 0
  `);
});
```

## Integration Example

```typescript
// apps/api/src/server.ts
import { paymentRouter } from './payments/router';
import { lessonRouter } from './lessons/router';
import { authRouter } from './auth/router';

app.use('/api/payments', paymentRouter);
app.use('/api/lessons', lessonRouter);
app.use('/api/auth', authRouter);

// Health check aggregation
app.get('/health', async (req, res) => {
  const services = ['payments', 'lessons', 'auth'];
  const health = await Promise.all(
    services.map(async service => {
      try {
        const response = await fetch(`http://localhost:${PORT}/api/${service}/health`);
        return { service, status: response.ok ? 'healthy' : 'unhealthy' };
      } catch {
        return { service, status: 'unavailable' };
      }
    })
  );
  
  res.json({
    status: health.every(h => h.status === 'healthy') ? 'healthy' : 'degraded',
    services: health,
    timestamp: new Date().toISOString()
  });
});
```

This structure ensures every domain is predictable, testable, and maintainable by LLMs.