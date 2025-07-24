# Claude Code Instructions - LLM-First Development

## Project Overview
Teach Niche V2 - Kendama tutorial marketplace with 15% platform fee on sales.
**Built BY LLMs, FOR LLMs** with extreme consistency and pattern recognition.

## Development Philosophy
- **Pattern Recognition**: Identical patterns for similar functionality
- **Context-Rich Naming**: `createStripeCheckoutSessionForLesson` not `checkout`
- **Zero Tolerance**: 100% documentation, no mocking, real data testing
- **Self-Documenting**: Directory structure tells the complete story

## Architecture
- **Frontend**: Next.js 15 (apps/web)
- **Backend**: Structured Monolith on Cloud Run (apps/api)
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: Firebase Auth
- **Payments**: Stripe Connect
- **Storage**: Google Cloud Storage

## Essential Commands

### Quick Start
```bash
# Complete setup (database + services + seed data)
pnpm setup

# Development with all services
pnpm dev

# Validation pipeline (types + lint + tests)
pnpm validate
```

### Development Workflow
```bash
# Start local services (PostgreSQL + Redis)
pnpm services:start

# Database operations
pnpm db:push              # Push schema changes
pnpm db:migrate           # Create migration
pnpm db:studio            # Open Prisma Studio
pnpm db:seed              # Seed test data

# Testing (real services, no mocking)
pnpm test                 # All tests
pnpm test:coverage        # With coverage report (90% minimum)
pnpm test:integration     # Integration tests only
pnpm test:watch           # Watch mode

# Code quality
pnpm check-types          # TypeScript validation
pnpm lint                 # ESLint check
pnpm lint:fix             # Auto-fix issues
pnpm format               # Prettier formatting
```

### MCP Test Server (AI Testing)
```bash
# Available via MCP interface for AI agents:
# - run-tests: Full test suite with real services
# - test-specific: Run specific test files
# - test-coverage: Generate coverage reports
# - setup-test-db: Initialize clean test database
# - test-api-health: Verify all health endpoints
```

## Standardized Structure

### Service Domain Pattern (MANDATORY)
```
src/{domain}/
├── router.ts         # Express routes + HTTP handling
├── service.ts        # Business logic + orchestration  
├── repository.ts     # Database queries + data access
├── validators.ts     # Input validation schemas
├── types.ts          # Domain-specific types
├── errors.ts         # Domain-specific error classes
└── __tests__/        # All domain tests
```

### Documentation Standards
Every file MUST have:
- **Docstrings**: Comprehensive function/class documentation
- **Type Safety**: Full TypeScript types, no `any`
- **Error Handling**: Explicit errors, never silent failures
- **Examples**: Usage examples in docstrings

## Current Implementation Status

### ✅ Completed (LLM-Ready)
- Turborepo monorepo with optimized structure
- PostgreSQL database with comprehensive Prisma schema
- Structured API monolith with domain organization
- Shared packages (database, types, utils) with type safety
- MCP test server for AI-driven testing
- Docker Compose for local development
- LLM-first culture documentation and standards

### 🏗️ In Progress 
- Next.js frontend migration
- Firebase Auth integration with custom claims
- Stripe Connect marketplace setup
- Real-data test suite implementation

### ⏳ Planned
- Terraform infrastructure as code
- GitHub Actions CI/CD pipeline
- Production deployment automation

## Testing Philosophy - Real Data Only

```typescript
// ❌ NEVER mock - breaks LLM pattern recognition
const mockStripe = jest.mock('stripe');

// ✅ ALWAYS use real services
const testDb = new PrismaClient({ 
  datasources: { db: { url: TEST_DATABASE_URL } }
});
const realStripe = new Stripe(TEST_SECRET_KEY);
```

## Code Quality Standards

- **90% Test Coverage** (enforced in CI)
- **Zero TypeScript Errors** (strict mode)
- **Consistent Error Handling** (domain-specific error classes)
- **Predictable File Organization** (identical across domains)
- **Comprehensive Logging** (structured with metadata)

## Error Handling Pattern

```typescript
// Every domain has standardized errors
export class LessonNotFoundError extends AppError {
  constructor(lessonId: string) {
    super(404, `Lesson ${lessonId} not found`, 'LESSON_NOT_FOUND');
  }
}

// Business logic throws explicit errors
if (!lesson.published) {
  throw new LessonNotPublishedError(lesson.id);
}
```

## Knowledge Transfer Protocol

When handing off to another AI agent:
1. Current task status in `.claude/CURRENT_TASK.md`
2. Key architectural decisions made
3. Watch points and critical considerations
4. Next logical steps with context

## Health Check Endpoints

Every service MUST implement:
- `GET /api/{service}/health` - Service health
- `GET /api/{service}/info` - Version and features  
- `GET /api/{service}/metrics` - Prometheus metrics

This codebase is optimized for AI comprehension and modification. Every pattern is consistent, every function documented, every test uses real data.