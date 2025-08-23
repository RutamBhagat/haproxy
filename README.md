# haproxy

## Project Overview

This is a high-availability PostgreSQL connection pooling system with HAProxy load balancing. The project uses a TypeScript monorepo structure with a Next.js frontend and Hono backend.

## Essential Commands

### Development
```bash
# Install dependencies (uses pnpm)
pnpm install

# Start all services (web on :3001, server on :3000)
pnpm dev

# Start specific services
pnpm dev:web    # Frontend only (port 3001)
pnpm dev:server # Backend only (port 3000)

# Code quality
pnpm check       # Run Biome formatting and linting
pnpm check-types # TypeScript type checking
```

### Database Operations
```bash
# Docker services
pnpm db:start   # Start PostgreSQL + HAProxy + PgBouncer containers
pnpm db:watch   # Start containers with logs
pnpm db:stop    # Stop containers
pnpm db:down    # Stop and remove containers

# Database management
pnpm db:push     # Push Prisma schema to database
pnpm db:generate # Generate Prisma client and Kysely types
pnpm db:migrate  # Run database migrations
pnpm db:studio   # Open Prisma Studio GUI
```

### Performance Testing
```bash
# Initialize pgbench (from apps/server directory)
pgbench -h localhost -p 5432 -U postgres -d postgres -i -s 50

# Run load test
pgbench -h localhost -p 5432 -U postgres -d postgres -c 10500 -j 150 -T 60 -M simple -P 10
```

## Architecture

### Database Stack (Docker Compose)
The system implements a robust connection pooling architecture:

1. **PostgreSQL** (port 5432 internally)
   - Primary database with 2 CPU cores, 4GB RAM limits
   - Data persisted in Docker volume

2. **PgBouncer Instances** (pgb1, pgb2, pgb3)
   - 3 identical connection poolers for redundancy
   - Transaction pooling mode with 70 connections each
   - Max 4000 client connections per instance
   - Each runs on port 6432 internally

3. **HAProxy** (port 5432 exposed, stats on 8404)
   - Load balances across all PgBouncer instances
   - Uses `leastconn` algorithm for distribution
   - Health checks every 2 seconds
   - Stats dashboard: http://localhost:8404/stats

4. **Health Monitor**
   - Monitors PgBouncer status via HAProxy stats API
   - Sends Slack notifications on state changes
   - Tracks state in `/tmp/pgbouncer_states.txt`
   - Requires `SLACK_WEBHOOK_URL` environment variable

### Application Structure

```
apps/
├── server/          # Hono backend API
│   ├── src/
│   │   ├── routers/ # API route handlers
│   │   ├── db/      # Database client and types
│   │   └── lib/     # Shared utilities (auth)
│   ├── docker/      # Docker configurations
│   └── prisma/      # Database schemas
└── web/             # Next.js frontend
```

### Key Technologies
- **Monorepo**: Turborepo with pnpm workspaces
- **Backend**: Hono framework with Better Auth
- **Database**: PostgreSQL with Prisma ORM + Kysely query builder
- **Frontend**: Next.js 15 with TailwindCSS and shadcn/ui
- **Code Quality**: Biome for linting/formatting

## Environment Configuration

Required environment variables in `apps/server/.env`:
- `DATABASE_URL`: PostgreSQL connection string (defaults to HAProxy on port 5432)
- `CORS_ORIGIN`: Frontend URL for CORS (default: http://localhost:3001)
- `BETTER_AUTH_SECRET`: Authentication secret key
- `BETTER_AUTH_URL`: Backend URL (default: http://localhost:3000)
- `SLACK_WEBHOOK_URL`: Slack webhook for monitoring alerts (optional)
- `POSTGRES_PASSWORD`: Database password for Docker containers

## Health Check Endpoint

The server exposes `/api/health/db` which:
- Tests database connectivity through HAProxy
- Returns connection details (database, user, server IP/port)
- Includes query performance metrics
- Confirms routing through HAProxy/PgBouncer

## Docker Service Management

The architecture ensures high availability:
- HAProxy automatically routes around failed PgBouncer instances
- Health checks mark servers DOWN after 3 failures (6 seconds)
- Servers marked UP after 2 successful checks (4 seconds)
- Monitor alerts on any state changes via Slack

To manually restart a failed PgBouncer:
```bash
docker start pgb1  # or pgb2, pgb3
```