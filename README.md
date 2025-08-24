# haproxy

## Project Overview

High-availability PostgreSQL connection pooling system with HAProxy load balancing, using a TypeScript monorepo structure with Next.js frontend and Hono backend.

## Architecture

### Database Infrastructure (Docker + Vagrant)

The system uses a multi-tier high-availability architecture:

1. **PostgreSQL** (Docker, internal port 5432)
   - Primary database with 2 CPU cores, 4GB RAM limits
   - Data persisted in Docker volume `haproxy_postgres_data`

2. **PgBouncer Pool** (Docker, pgb1/pgb2/pgb3)
   - 3 identical connection poolers for redundancy
   - Transaction pooling mode with 70 connections each
   - Max 4000 client connections per instance
   - Internal port 6432, exposed on 6432-6434 on host

3. **HAProxy with Keepalived** (Vagrant VMs)
   - Two HAProxy instances (192.168.1.10 and 192.168.1.11)
   - Virtual IP (VIP): 192.168.1.100:5432 for database access
   - Keepalived manages failover between HAProxy instances
   - Stats dashboard: http://192.168.1.100:8404/stats
   - Uses `leastconn` algorithm for PgBouncer distribution

4. **Health Monitor** (Docker)
   - Monitors PgBouncer status via HAProxy stats API
   - Sends Slack notifications on state changes
   - Requires `SLACK_WEBHOOK_URL` environment variable

### Application Structure

```
apps/
├── server/          # Hono backend API
│   ├── src/
│   │   ├── routers/ # API route handlers
│   │   ├── db/      # Database client (Kysely) and types
│   │   └── lib/     # Shared utilities (Better Auth)
│   ├── docker/      # Docker configurations and monitoring scripts
│   ├── vagrant/     # HAProxy and Keepalived configs
│   └── prisma/      # Database schema and migrations
└── web/             # Next.js frontend
    ├── src/
    │   ├── app/     # App router pages
    │   ├── components/ # UI components (shadcn/ui)
    │   └── lib/     # Client utilities
    └── public/      # Static assets
```

### Technology Stack

- **Monorepo**: Turborepo with pnpm workspaces (pnpm 10.14.0)
- **Backend**: Hono framework with Better Auth for authentication
- **Database**: PostgreSQL with Prisma ORM (schema) + Kysely (type-safe queries)
- **Frontend**: Next.js 15 with TailwindCSS v4 and shadcn/ui components
- **Code Quality**: Biome for formatting/linting (2 spaces, double quotes)
- **Infrastructure**: Docker Compose + Vagrant for HAProxy VMs

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
# Docker services (from root or apps/server)
pnpm db:start   # Start PostgreSQL + PgBouncer containers
pnpm db:watch   # Start containers with logs
pnpm db:stop    # Stop containers
pnpm db:down    # Stop and remove containers

# Schema management
pnpm db:push     # Push Prisma schema to database
pnpm db:generate # Generate Prisma client and Kysely types
pnpm db:migrate  # Run database migrations
pnpm db:studio   # Open Prisma Studio GUI
```

### HAProxy VM Management

```bash
# From apps/server directory
vagrant up          # Start both HAProxy VMs
vagrant status      # Check VM status
vagrant ssh haproxy1  # SSH into master HAProxy
vagrant ssh haproxy2  # SSH into backup HAProxy
vagrant halt        # Stop VMs
vagrant destroy     # Remove VMs
```

### Testing & Monitoring

```bash
# Database health check
curl http://localhost:3000/api/health/db

# HAProxy stats dashboard
open http://192.168.1.100:8404/stats

# Performance testing (from apps/server)
pgbench -h 192.168.1.100 -p 5432 -U postgres -d postgres -i -s 50
pgbench -h 192.168.1.100 -p 5432 -U postgres -d postgres -c 10500 -j 150 -T 60 -M simple -P 10
```

## Environment Configuration

Required environment variables in `apps/server/.env`:

```bash
DATABASE_URL=postgresql://postgres:password@192.168.1.100:5432/postgres
CORS_ORIGIN=http://localhost:3001
BETTER_AUTH_SECRET=<generate-secret>
BETTER_AUTH_URL=http://localhost:3000
SLACK_WEBHOOK_URL=<optional-for-monitoring>
POSTGRES_PASSWORD=password
HAPROXY_STATS_URL=http://192.168.1.100:8404/stats
```

## High Availability Features

- **Automatic Failover**: Keepalived manages VIP failover between HAProxy instances
- **Connection Pooling**: PgBouncer reduces database load with transaction pooling
- **Health Monitoring**: Automatic detection and alerting of failed services
- **Load Distribution**: HAProxy uses least connections algorithm for optimal distribution
- **Service Recovery**: Failed PgBouncer instances automatically removed from rotation

## Development Workflow

1. **Database Changes**: Modify `apps/server/prisma/schema.prisma`, then run `pnpm db:push` and `pnpm db:generate`
2. **API Development**: Add routes in `apps/server/src/routers/`, types are auto-generated from Prisma
3. **Frontend Development**: Components in `apps/web/src/components/`, pages in `apps/web/src/app/`
4. **Code Quality**: Always run `pnpm check` before committing
5. **Type Safety**: Run `pnpm check-types` to ensure TypeScript compilation

## Connection Flow

```
Client (3001) → Next.js → Hono API (3000) → VIP (192.168.1.100:5432) 
→ HAProxy (master/backup) → PgBouncer (1/2/3) → PostgreSQL
```

The VIP ensures zero-downtime failover between HAProxy instances, while HAProxy ensures continuous service by routing around failed PgBouncer instances.