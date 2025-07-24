# Teach Niche V2

A modern kendama tutorial marketplace where instructors create video lessons and students purchase access. Built for reliability, maintainability, and LLM-driven development.

## Tech Stack

- **Frontend**: Next.js 15 with App Router
- **Backend**: Node.js/Express structured monolith
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Firebase Auth
- **Payments**: Stripe Connect (15% platform fee)
- **Infrastructure**: Google Cloud Run, Cloud Storage
- **Development**: Turborepo, TypeScript, pnpm

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL client (optional, for direct DB access)

### Local Development Setup

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/yourusername/teach-niche-v2.git
   cd teach-niche-v2
   pnpm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Start local services**
   ```bash
   docker-compose up -d
   ```

4. **Run database migrations**
   ```bash
   pnpm turbo run db:migrate --filter=@teach-niche/database
   ```

5. **Start development servers**
   ```bash
   pnpm dev
   ```

   This starts:
   - API server at http://localhost:8080
   - Web app at http://localhost:3000
   - Prisma Studio at http://localhost:5555

## Project Structure

```
teach-niche-v2/
├── apps/
│   ├── api/          # Backend API (structured monolith)
│   └── web/          # Next.js frontend
├── packages/
│   ├── database/     # Prisma schema and client
│   ├── types/        # Shared TypeScript types
│   └── utils/        # Common utilities
├── infrastructure/   # Terraform IaC (coming soon)
├── scripts/          # Development and deployment scripts
└── docker-compose.yml
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Start all development servers
pnpm dev

# Build all packages
pnpm build

# Run linting
pnpm lint

# Type checking
pnpm turbo run check-types

# Database commands
pnpm turbo run db:studio --filter=@teach-niche/database  # Prisma Studio
pnpm turbo run db:migrate --filter=@teach-niche/database # Run migrations
```

## API Endpoints

### Authentication
- `GET /api/auth/me` - Get current user
- `POST /api/auth/set-role` - Set user role

### Lessons
- `GET /api/lessons` - List all lessons
- `GET /api/lessons/:id` - Get lesson details
- `POST /api/lessons` - Create lesson (instructor only)

### Payments
- `POST /api/payments/checkout` - Create Stripe checkout session
- `POST /api/payments/webhook` - Stripe webhook handler

### Videos
- `GET /api/videos/access/:lessonId` - Get signed video URL

## Database Schema

The database uses PostgreSQL with the following main tables:
- `users` - Students and instructors
- `lessons` - Tutorial content
- `purchases` - Transaction records
- `reviews` - Lesson ratings and comments
- `payouts` - Instructor payment records

See `packages/database/prisma/schema.prisma` for full schema.

## Deployment

Coming soon: Automated deployment to Google Cloud Run via GitHub Actions.

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests and linting
4. Submit a pull request

## License

Private - All rights reserved
