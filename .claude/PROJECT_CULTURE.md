---
title: Project Culture - LLM-First Development
description: Development philosophy and standards for AI-driven development
created: 2024-07-24
updated: 2024-07-24
type: culture
---

# LLM-First Development Culture

This repository is designed BY LLMs, FOR LLMs using Claude Code. Every decision optimizes for AI comprehension and modification.

## Core Philosophy

### 1. Pattern Recognition Over Human Memory
- **Extreme Consistency**: Identical patterns for similar functionality
- **Context-Rich Naming**: `createStripeCheckoutSessionForLesson` not `checkout`
- **Self-Documenting Structure**: Directory names tell the complete story
- **Predictable File Locations**: Same structure in every module

### 2. Zero-Tolerance Quality Standards
- **Clean Root**: Only essential files at root level
- **100% Documentation**: Every function, class, and module has docstrings
- **Explicit Errors**: Never swallow exceptions or fail silently
- **Type Safety**: Full TypeScript types, no `any` unless absolutely necessary

### 3. Real-Data Testing Philosophy
- **No Mocking**: Tests use actual PostgreSQL, Redis, and services
- **90% Coverage Minimum**: Enforced in CI/CD
- **Non-Interactive**: All tests run without human intervention
- **Contract Testing**: Clear interfaces with explicit expectations

## Project Structure Standards

### Service Structure (API Domains)
```
src/{domain}/
├── router.ts      # Express routes
├── service.ts     # Business logic
├── repository.ts  # Database queries
├── validators.ts  # Input validation
├── types.ts       # Domain-specific types
└── __tests__/     # Domain tests
```

### Mandatory Endpoints
Every service MUST implement:
- `GET /health` - Basic health check
- `GET /info` - Version and metadata
- `GET /metrics` - Prometheus-compatible metrics

### File Naming Conventions
- **Routes**: `{resource}.router.ts` (e.g., `lessons.router.ts`)
- **Services**: `{resource}.service.ts` (e.g., `payment.service.ts`)
- **Tests**: `{file}.test.ts` (e.g., `payment.service.test.ts`)
- **Types**: `{domain}.types.ts` (e.g., `api.types.ts`)

## Documentation Standards

### Frontmatter Requirements
Every `.md` file MUST have YAML frontmatter:
```yaml
---
title: Descriptive Title
description: One-line description
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: guide|reference|culture|architecture
---
```

### Docstring Standards
```typescript
/**
 * Creates a Stripe checkout session for purchasing a lesson.
 * 
 * @description Handles the complete checkout flow including:
 * - Verifying the lesson exists and is published
 * - Calculating platform fees (15%)
 * - Creating Stripe session with proper metadata
 * - Logging the transaction attempt
 * 
 * @param lessonId - The UUID of the lesson to purchase
 * @param userId - The Firebase UID of the purchasing user
 * @param successUrl - URL to redirect after successful payment
 * @param cancelUrl - URL to redirect if payment cancelled
 * 
 * @returns Stripe checkout session with payment URL
 * 
 * @throws {NotFoundError} When lesson doesn't exist
 * @throws {ForbiddenError} When lesson is unpublished
 * @throws {StripeError} When Stripe API fails
 * 
 * @example
 * const session = await createCheckoutSession(
 *   'lesson-123',
 *   'user-456',
 *   'https://app.com/success',
 *   'https://app.com/lessons/123'
 * );
 */
```

### Change Logs
Maintain `CHANGELOG.md` in reverse chronological order:
```markdown
## [2024-07-24] Added payment processing
- Implemented Stripe checkout flow
- Added platform fee calculation
- Created purchase recording system

## [2024-07-23] Initial setup
- Created project structure
- Set up Turborepo
- Configured PostgreSQL schema
```

## Code Organization Principles

### 1. Domain-Driven Structure
```
apps/api/src/
├── auth/          # Everything auth-related
├── payments/      # All payment logic
├── videos/        # Video access control
├── lessons/       # Lesson CRUD
└── shared/        # Cross-domain utilities
```

### 2. Explicit Imports
```typescript
// ❌ Bad - unclear origin
import { validateEmail } from '../../../utils';

// ✅ Good - explicit package
import { validateEmail } from '@teach-niche/utils';
```

### 3. Consistent Error Handling
```typescript
// Every domain has standard errors
export class LessonNotFoundError extends AppError {
  constructor(lessonId: string) {
    super(404, `Lesson ${lessonId} not found`, 'LESSON_NOT_FOUND');
  }
}
```

## Testing Standards

### Test Structure
```typescript
describe('PaymentService', () => {
  let service: PaymentService;
  let db: PrismaClient;
  
  beforeAll(async () => {
    // Real database connection
    db = new PrismaClient();
    await db.$connect();
  });
  
  afterAll(async () => {
    // Cleanup
    await db.$disconnect();
  });
  
  describe('createCheckoutSession', () => {
    it('should create session with correct platform fee', async () => {
      // Real data, real calculations
      const lesson = await db.lesson.create({
        data: testLesson
      });
      
      const session = await service.createCheckoutSession(
        lesson.id,
        'test-user'
      );
      
      expect(session.payment_intent_data.application_fee_amount)
        .toBe(Math.floor(lesson.price * 0.15));
    });
  });
});
```

### MCP Testing Server
Configure a dedicated MCP server for testing:
```yaml
# .mcp-test.yaml
servers:
  test-runner:
    command: "pnpm"
    args: ["run", "test:mcp"]
    env:
      DATABASE_URL: "postgresql://test:test@localhost:5433/test"
      NODE_ENV: "test"
```

## Operational Standards

### Environment Configuration
```typescript
// config/index.ts
export const config = {
  database: {
    url: process.env.DATABASE_URL || throwError('DATABASE_URL required'),
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || throwError('STRIPE_SECRET_KEY required'),
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || throwError('STRIPE_WEBHOOK_SECRET required'),
  },
  // Never hardcode values
};
```

### Script Naming
```json
{
  "scripts": {
    "dev": "Run development servers",
    "build": "Build for production",
    "test": "Run all tests",
    "test:unit": "Unit tests only",
    "test:integration": "Integration tests",
    "db:migrate": "Run migrations",
    "db:seed": "Seed database",
    "lint": "ESLint check",
    "typecheck": "TypeScript check"
  }
}
```

## LLM Optimization Techniques

### 1. Context Preservation
```typescript
// Group related functionality
export class LessonService {
  // All lesson operations in one place
  async create() {}
  async update() {}
  async delete() {}
  async find() {}
}
```

### 2. Self-Contained Modules
```typescript
// Each file should be understandable in isolation
import { User, Lesson, Purchase } from '@teach-niche/database';
import { AppError } from '@teach-niche/utils';
import { LessonCreateInput } from './types';
```

### 3. Explicit Type Definitions
```typescript
// Define all types explicitly
export interface InstructorDashboardData {
  user: User;
  lessons: LessonWithStats[];
  totalEarnings: number;
  pendingPayouts: number;
  recentPurchases: Purchase[];
}
```

## Commit Standards

### Commit Messages
```
feat(payments): Add Stripe checkout integration

- Implement checkout session creation
- Add webhook handling for payment confirmation  
- Calculate and store platform fees
- Update purchase records on success

Closes #123
```

### Branch Naming
- `feat/lesson-creation` - New features
- `fix/payment-calculation` - Bug fixes
- `refactor/auth-middleware` - Code improvements
- `docs/api-endpoints` - Documentation

## Code Review Checklist

Before any merge:
- [ ] All functions have comprehensive docstrings
- [ ] Test coverage > 90%
- [ ] No hardcoded values
- [ ] Consistent error handling
- [ ] Types fully specified (no `any`)
- [ ] Documentation updated
- [ ] Integration tests pass with real services

## Knowledge Transfer

### Agent Handoff Template
```markdown
## Current State
- Working on: Payment integration
- Completed: Checkout flow
- Next steps: Webhook handling

## Key Decisions
- Using Stripe Connect for marketplace
- 15% platform fee calculated at checkout
- Async webhook processing via queue

## Watch Points
- Webhook signature verification critical
- Must handle duplicate webhooks
- Fee calculation must match Stripe exactly

## Resources
- [Stripe Docs](https://stripe.com/docs)
- Database schema: packages/database/prisma/schema.prisma
- Payment types: packages/types/src/payments.ts
```

This culture ensures every line of code is optimized for AI comprehension and modification.