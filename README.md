# Payroll System - Backend

Serverless backend API for the AI-First Payroll Management System.

## Tech Stack

- **Runtime**: Node.js 20.x
- **Language**: TypeScript 5.x
- **Framework**: Serverless Framework
- **Database**: PostgreSQL 15 (Supabase)
- **Cache**: Redis (Upstash)
- **ORM**: Prisma 5.x
- **Deployment**: AWS Lambda + API Gateway

## Prerequisites

- Node.js 20.x
- Docker & Docker Compose
- AWS CLI configured
- Serverless Framework

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Local Databases

```bash
# From workspace root
docker-compose up -d
```

### 3. Setup Environment

```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

### 4. Run Migrations

```bash
npm run prisma:migrate -- --name init
npm run prisma:generate
```

### 5. Start Development Server

```bash
npm run dev
```

Backend will be available at `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server with serverless-offline
- `npm run build` - Compile TypeScript
- `npm run deploy:dev` - Deploy to AWS dev environment
- `npm run deploy:prod` - Deploy to AWS production environment
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:studio` - Open Prisma Studio GUI
- `npm test` - Run tests
- `npm run lint` - Lint code

## Project Structure

```
src/
├── handlers/        # Lambda function handlers
├── services/        # Business logic
├── repositories/    # Data access layer
├── middleware/      # Lambda middleware
├── utils/           # Utility functions
├── types/           # TypeScript types
├── schemas/         # Zod validation schemas
└── config/          # Configuration

prisma/
├── schema.prisma    # Database schema
└── migrations/      # Migration files
```

## Related Repositories

- **Frontend**: [payroll-frontend](https://github.com/your-org/payroll-frontend)
- **Infrastructure**: [payroll-infrastructure](https://github.com/your-org/payroll-infrastructure)

## Environment Variables

See `.env.example` for required environment variables.

## Database

Using Prisma with PostgreSQL. Connection pooling is configured for serverless.

### Run Migrations

```bash
npm run prisma:migrate -- --name migration_name
```

### Access Database

```bash
npm run prisma:studio
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Deployment

### Deploy to Dev

```bash
npm run deploy:dev
```

### Deploy to Production

```bash
npm run deploy:prod
```

## License

MIT
