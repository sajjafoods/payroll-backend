# Backend Repository Setup Commands

## 1. Create GitHub Repository

```bash
# Option 1: Using GitHub CLI (recommended)
gh repo create your-org/payroll-backend --public --description "AI-First Payroll System - Backend"

# Option 2: Manually via GitHub Web Interface
# Go to https://github.com/new
# Create repository: payroll-backend
```

## 2. Clone Repository

```bash
# Create workspace directory
mkdir payroll-workspace
cd payroll-workspace

# Clone repository
git clone https://github.com/your-org/payroll-backend.git
cd payroll-backend
```

## 3. Initialize Backend Project

### Install Dependencies

```bash
# Initialize npm project
npm init -y

# Install core dependencies
npm install --save \
  @prisma/client \
  zod \
  jsonwebtoken \
  bcryptjs \
  ioredis \
  @aws-sdk/client-bedrock-runtime

# Install dev dependencies
npm install --save-dev \
  @types/node \
  @types/jsonwebtoken \
  @types/bcryptjs \
  @types/aws-lambda \
  typescript \
  ts-node \
  serverless \
  serverless-offline \
  serverless-esbuild \
  serverless-prune-plugin \
  prisma \
  dotenv-cli \
  eslint \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin \
  prettier \
  jest \
  @types/jest \
  ts-jest
```

### Create Directory Structure

```bash
# Create directory structure
mkdir -p src/handlers/{auth,employees,attendance,payroll,ai}
mkdir -p src/{services,repositories,middleware,utils,types,schemas,config,openapi}
mkdir -p tests/{unit,integration,helpers}
mkdir -p scripts
mkdir -p prisma/migrations

# Create basic files
touch src/handlers/auth/{sendOtp,verifyOtp,refreshToken}.ts
touch src/handlers/employees/{list,create,update,delete}.ts
touch src/services/{auth,employee,attendance,payroll,ai}.service.ts
touch src/repositories/{user,employee,attendance,payroll}.repository.ts
touch src/middleware/{auth,error,validation,rateLimit}.middleware.ts
touch src/utils/{jwt,otp,redis,database,logger}.ts
touch src/config/{database,redis,aws,constants}.ts
touch serverless.yml
touch .env.example
touch .env.local
touch .gitignore
touch README.md
```

### Configure Package Scripts

```bash
# Update package.json scripts
npm pkg set scripts.dev="serverless offline start"
npm pkg set scripts.build="tsc"
npm pkg set scripts.deploy="serverless deploy"
npm pkg set scripts.deploy:dev="serverless deploy --stage dev"
npm pkg set scripts.deploy:prod="serverless deploy --stage prod"
npm pkg set scripts.lint="eslint . --ext .ts"
npm pkg set scripts.format="prettier --write \"src/**/*.ts\""
npm pkg set scripts.test="jest"
npm pkg set scripts.test:watch="jest --watch"
npm pkg set scripts.test:coverage="jest --coverage"
npm pkg set scripts.prisma:generate="dotenv -e .env.local -- prisma generate"
npm pkg set scripts.prisma:migrate="dotenv -e .env.local -- prisma migrate dev"
npm pkg set scripts.prisma:deploy="dotenv -e .env.local -- prisma migrate deploy"
npm pkg set scripts.prisma:studio="dotenv -e .env.local -- prisma studio"
npm pkg set scripts.openapi:generate="ts-node scripts/generate-openapi.ts"
```

## 4. Create Configuration Files

### Create .gitignore

```bash
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.npm

# Environment
.env
.env.local
.env.*.local

# Build
dist/
.build/
.serverless/

# TypeScript
*.tsbuildinfo

# IDE
.vscode/
.idea/
*.iml

# Logs
logs/
*.log

# OS
.DS_Store
Thumbs.db

# Prisma
prisma/migrations/**/applied_steps.json
EOF
```

### Create serverless.yml

```bash
cat > serverless.yml << 'EOF'
service: payroll-backend

frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs20.x
  region: ap-south-1
  stage: ${opt:stage, 'dev'}
  memorySize: 1024
  timeout: 30
  environment:
    STAGE: ${self:provider.stage}
    DATABASE_URL: ${env:DATABASE_URL}
    REDIS_URL: ${env:REDIS_URL}
    JWT_SECRET: ${env:JWT_SECRET}

functions:
  # Auth
  sendOtp:
    handler: src/handlers/auth/sendOtp.handler
    events:
      - httpApi:
          path: /api/v1/auth/send-otp
          method: post

  verifyOtp:
    handler: src/handlers/auth/verifyOtp.handler
    events:
      - httpApi:
          path: /api/v1/auth/verify-otp
          method: post

  # Employees
  listEmployees:
    handler: src/handlers/employees/list.handler
    events:
      - httpApi:
          path: /api/v1/employees
          method: get

plugins:
  - serverless-esbuild
  - serverless-offline
  - serverless-prune-plugin

custom:
  esbuild:
    bundle: true
    minify: false
    sourcemap: true
    target: 'node20'
    platform: 'node'
  prune:
    automatic: true
    number: 3
EOF
```

### Create tsconfig.json

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node", "jest"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", ".serverless"]
}
EOF
```

### Initialize TypeScript

```bash
# The tsconfig.json is already created above
# Just verify it exists
cat tsconfig.json
```

### Initialize Prisma

```bash
# Initialize Prisma
npx prisma init
```

## 5. Setup Environment Variables

### Create .env.example

```bash
cat > .env.example << 'EOF'
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/payroll_dev?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT Secrets
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-in-production"

# AWS
AWS_REGION="ap-south-1"

# Environment
NODE_ENV="development"
EOF
```

### Create .env.local

```bash
cat > .env.local << 'EOF'
DATABASE_URL="postgresql://dev_user:dev_password@localhost:5432/payroll_dev?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-in-production"
AWS_REGION="ap-south-1"
NODE_ENV="development"
EOF
```

## 6. Setup Local Databases

### Create docker-compose.yml (in workspace root)

```bash
# Go to workspace root
cd ..

# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: payroll-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: dev_user
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: payroll_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: payroll-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
EOF

# Start databases
docker-compose up -d

# Verify databases are running
docker ps
```

## 7. Initialize Database with Prisma

```bash
# Go back to backend directory
cd payroll-backend

# Run Prisma migrations using the npm script
npm run prisma:migrate -- --name init

# Generate Prisma client
npm run prisma:generate
```

## 8. Create README.md

```bash
cat > README.md << 'EOF'
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
EOF
```

## 9. Initialize Git and Push

```bash
# Initialize Git
git init
git add .
git commit -m "Initial backend setup"
git branch -M main
git remote add origin https://github.com/your-org/payroll-backend.git
git push -u origin main
```

## 10. Start Development

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run dev

# Backend should now be running on http://localhost:3000
```

## Common Commands Reference

```bash
# Development
npm run dev                      # Start development server
npm run build                    # Build TypeScript
npm test                         # Run tests
npm run lint                     # Lint code

# Database
npm run prisma:migrate           # Run migrations (uses .env.local)
npm run prisma:generate          # Generate Prisma client (uses .env.local)
npm run prisma:deploy            # Deploy migrations (uses .env.local)
npm run prisma:studio            # Open Prisma Studio (uses .env.local)

# Deployment
npm run deploy:dev               # Deploy to AWS dev
npm run deploy:prod              # Deploy to AWS production

# Docker
cd ..                            # Go to workspace root
docker-compose up -d             # Start databases
docker-compose down              # Stop databases
docker-compose logs -f postgres  # View PostgreSQL logs
docker-compose logs -f redis     # View Redis logs
```

## Troubleshooting

### Backend won't start

```bash
# Check if databases are running
docker ps

# Check environment variables
cat .env.local

# Reset Prisma (using npm scripts with dotenv-cli)
npm run prisma:generate
npm run prisma:migrate -- --name reset
```

### Prisma can't connect to database

```bash
# Verify .env.local has correct DATABASE_URL
cat .env.local

# Test database connection directly
docker exec -it payroll-postgres psql -U dev_user -d payroll_dev

# If Prisma still can't read .env.local, verify dotenv-cli is installed
npm list dotenv-cli

# Manually test with dotenv-cli
npx dotenv -e .env.local -- prisma migrate dev --name test
```

### Port already in use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Docker containers won't start

```bash
# Stop all containers
docker-compose down

# Remove volumes and restart
docker-compose down -v
docker-compose up -d

# Check logs
docker-compose logs
```
