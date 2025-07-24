---
title: Testing Guide - Real Data Philosophy
description: Comprehensive testing strategy using real services
created: 2024-07-24
updated: 2024-07-24
type: guide
---

# Testing Guide - Real Data Philosophy

## Core Principles

1. **No Mocking** - Tests use real PostgreSQL, Redis, and external services
2. **Isolated Test Database** - Separate database for tests that gets reset
3. **90% Coverage Minimum** - Enforced in CI/CD pipeline
4. **Non-Interactive** - All tests run without human intervention

## Test Environment Setup

### Docker Compose for Tests
```yaml
# docker-compose.test.yml
version: '3.8'

services:
  postgres-test:
    image: postgres:16-alpine
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: teachniche_test
    tmpfs:
      - /var/lib/postgresql/data

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    tmpfs:
      - /data
```

### Test Configuration
```typescript
// apps/api/src/test/setup.ts
import { PrismaClient } from '@teach-niche/database';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const testDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || 
           'postgresql://testuser:testpass@localhost:5433/teachniche_test'
    }
  }
});

export async function setupTestDatabase() {
  // Reset database
  await execAsync('pnpm turbo run db:push --filter=@teach-niche/database');
  
  // Run migrations
  await execAsync('pnpm turbo run db:migrate --filter=@teach-niche/database');
  
  // Clear all data
  await testDb.$executeRaw`TRUNCATE TABLE users, lessons, purchases, reviews, payouts RESTART IDENTITY CASCADE`;
}

export async function teardownTestDatabase() {
  await testDb.$disconnect();
}
```

## Test Structure Standards

### Unit Tests
```typescript
// apps/api/src/payments/service.test.ts
import { PaymentService } from './service';
import { testDb, setupTestDatabase, teardownTestDatabase } from '../test/setup';
import { createTestUser, createTestLesson } from '../test/factories';

describe('PaymentService', () => {
  let service: PaymentService;
  
  beforeAll(async () => {
    await setupTestDatabase();
    service = new PaymentService(testDb);
  });
  
  afterAll(async () => {
    await teardownTestDatabase();
  });
  
  beforeEach(async () => {
    // Clean data between tests
    await testDb.$executeRaw`TRUNCATE TABLE purchases RESTART IDENTITY CASCADE`;
  });
  
  describe('createCheckoutSession', () => {
    it('should create session with 15% platform fee', async () => {
      // Arrange - Real data
      const instructor = await createTestUser({ role: 'INSTRUCTOR' });
      const lesson = await createTestLesson({
        instructorId: instructor.id,
        price: 2000 // $20.00
      });
      const student = await createTestUser({ role: 'STUDENT' });
      
      // Act - Real service call
      const session = await service.createCheckoutSession(
        lesson.id,
        student.id
      );
      
      // Assert - Real calculations
      expect(session).toBeDefined();
      expect(session.payment_intent_data.application_fee_amount).toBe(300); // 15% of $20
      expect(session.metadata.lessonId).toBe(lesson.id);
      expect(session.metadata.userId).toBe(student.id);
    });
    
    it('should throw error for unpublished lesson', async () => {
      // Arrange
      const lesson = await createTestLesson({ published: false });
      const student = await createTestUser();
      
      // Act & Assert
      await expect(
        service.createCheckoutSession(lesson.id, student.id)
      ).rejects.toThrow('Lesson not available for purchase');
    });
  });
});
```

### Integration Tests
```typescript
// apps/api/src/test/integration/purchase-flow.test.ts
import request from 'supertest';
import app from '../../server';
import { testDb, setupTestDatabase } from '../setup';
import { generateAuthToken } from '../utils';

describe('Complete Purchase Flow', () => {
  let authToken: string;
  let lessonId: string;
  
  beforeAll(async () => {
    await setupTestDatabase();
    
    // Create real test data
    const instructor = await testDb.user.create({
      data: {
        firebaseUid: 'test-instructor',
        email: 'instructor@test.com',
        role: 'INSTRUCTOR',
        stripeAccountId: 'acct_test123'
      }
    });
    
    const lesson = await testDb.lesson.create({
      data: {
        title: 'Advanced Kendama Tricks',
        price: 1999,
        instructorId: instructor.id,
        published: true
      }
    });
    
    lessonId = lesson.id;
    authToken = await generateAuthToken('test-student');
  });
  
  it('should complete full purchase flow', async () => {
    // 1. Get lesson details
    const lessonResponse = await request(app)
      .get(`/api/lessons/${lessonId}`)
      .expect(200);
      
    expect(lessonResponse.body.data.price).toBe(1999);
    expect(lessonResponse.body.data.isPurchased).toBe(false);
    
    // 2. Create checkout session
    const checkoutResponse = await request(app)
      .post('/api/payments/checkout')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ lessonId })
      .expect(200);
      
    expect(checkoutResponse.body.data.sessionUrl).toMatch(/checkout\.stripe\.com/);
    
    // 3. Simulate webhook (payment success)
    const webhookPayload = createStripeWebhookPayload({
      sessionId: checkoutResponse.body.data.sessionId,
      amount: 1999
    });
    
    await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', generateWebhookSignature(webhookPayload))
      .send(webhookPayload)
      .expect(200);
      
    // 4. Verify purchase recorded
    const purchase = await testDb.purchase.findFirst({
      where: {
        lessonId,
        userId: 'test-student'
      }
    });
    
    expect(purchase).toBeDefined();
    expect(purchase.amount).toBe(1999);
    expect(purchase.platformFee).toBe(300);
    expect(purchase.instructorEarnings).toBe(1699);
    
    // 5. Verify video access granted
    const videoResponse = await request(app)
      .get(`/api/videos/access/${lessonId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
      
    expect(videoResponse.body.data.url).toMatch(/storage\.googleapis\.com/);
  });
});
```

## Test Factories

```typescript
// apps/api/src/test/factories.ts
import { faker } from '@faker-js/faker';
import { testDb } from './setup';

export async function createTestUser(overrides?: Partial<any>) {
  return testDb.user.create({
    data: {
      firebaseUid: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
      role: 'STUDENT',
      ...overrides
    }
  });
}

export async function createTestLesson(overrides?: Partial<any>) {
  const instructor = overrides?.instructorId ? null : await createTestUser({ role: 'INSTRUCTOR' });
  
  return testDb.lesson.create({
    data: {
      title: faker.lorem.sentence(),
      description: faker.lorem.paragraph(),
      price: faker.number.int({ min: 999, max: 9999 }),
      published: true,
      instructorId: overrides?.instructorId || instructor!.id,
      ...overrides
    }
  });
}

export async function createTestPurchase(userId: string, lessonId: string) {
  const lesson = await testDb.lesson.findUnique({ where: { id: lessonId } });
  const amount = lesson!.price;
  const platformFee = Math.floor(amount * 0.15);
  
  return testDb.purchase.create({
    data: {
      userId,
      lessonId,
      amount,
      platformFee,
      instructorEarnings: amount - platformFee,
      stripePaymentIntentId: `pi_test_${faker.string.alphanumeric(16)}`,
      status: 'COMPLETED'
    }
  });
}
```

## MCP Test Server

```yaml
# .mcp/test-server.yml
name: teach-niche-test
version: 1.0.0
description: Test runner for Teach Niche V2

tools:
  - name: run-tests
    description: Run test suite with real services
    inputSchema:
      type: object
      properties:
        pattern:
          type: string
          description: Test file pattern (e.g., "payment")
        coverage:
          type: boolean
          description: Generate coverage report
    script: |
      # Start test services
      docker-compose -f docker-compose.test.yml up -d
      
      # Wait for services
      until pg_isready -h localhost -p 5433; do sleep 1; done
      
      # Run tests
      if [ -n "$pattern" ]; then
        pnpm test -- --testNamePattern="$pattern"
      else
        pnpm test
      fi
      
      if [ "$coverage" = true ]; then
        pnpm test:coverage
      fi
      
      # Stop services
      docker-compose -f docker-compose.test.yml down

  - name: test-specific
    description: Run a specific test file
    inputSchema:
      type: object
      properties:
        file:
          type: string
          description: Path to test file
      required: [file]
    script: |
      docker-compose -f docker-compose.test.yml up -d
      pnpm test "$file"
      docker-compose -f docker-compose.test.yml down

  - name: test-watch
    description: Run tests in watch mode
    inputSchema:
      type: object
      properties:
        pattern:
          type: string
    script: |
      docker-compose -f docker-compose.test.yml up -d
      pnpm test -- --watch --testNamePattern="$pattern"
```

## Coverage Requirements

```javascript
// jest.config.js
module.exports = {
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/',
    '/__tests__/',
    '/dist/'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/test/**'
  ]
};
```

## CI/CD Test Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: testuser
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: teachniche_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
          
    steps:
      - uses: actions/checkout@v3
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
          
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: 'pnpm'
          
      - run: pnpm install
      
      - name: Setup test database
        env:
          DATABASE_URL: postgresql://testuser:testpass@localhost:5432/teachniche_test
        run: |
          pnpm turbo run db:push --filter=@teach-niche/database
          
      - name: Run tests with coverage
        env:
          TEST_DATABASE_URL: postgresql://testuser:testpass@localhost:5432/teachniche_test
          NODE_ENV: test
        run: pnpm test:coverage
        
      - name: Check coverage thresholds
        run: |
          if [ $(cat coverage/coverage-summary.json | jq '.total.lines.pct') -lt 90 ]; then
            echo "Coverage below 90%"
            exit 1
          fi
```

## Best Practices

1. **Test Independence**: Each test should be able to run in isolation
2. **Data Cleanup**: Always clean up test data between tests
3. **Real Services**: Use actual Stripe test mode, real database
4. **Deterministic**: Tests should produce same results every run
5. **Fast Feedback**: Optimize for quick test execution

This approach ensures our tests catch real issues that mocked tests would miss.