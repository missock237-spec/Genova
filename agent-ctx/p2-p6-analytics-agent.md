# PRIORITÉ 2 (PostgreSQL Migration) & PRIORITÉ 6 (Analytics) - Work Record

## Summary

Successfully migrated the Genova SaaS project from SQLite to PostgreSQL and implemented the complete Analytics system.

## Changes Made

### 1. PostgreSQL Migration (PRIORITÉ 2)

#### Prisma Schema (`prisma/schema.prisma`)
- Changed `provider = "sqlite"` → `provider = "postgresql"`
- Added `emailVerified DateTime?` to User model
- Updated Session model with new fields: `refreshToken`, `refreshExpiresAt`, `lastAccessedAt`, `ipAddress`, `userAgent`
- Added `EmailVerification` model with `@@index([email, code])` and `@@map("email_verifications")`
- Added `emailVerifications EmailVerification[]` relation to User

#### Environment (`.env`)
- Changed `DATABASE_URL` from SQLite (`file:./db/custom.db`) to PostgreSQL (`postgresql://genova:genova_secret@localhost:5432/genova?schema=public`)

#### PostgreSQL Server Setup
- Downloaded and extracted PostgreSQL 17.2 embedded binaries (from Zonky embedded-postgres JAR)
- Installed to `/home/z/my-project/pg-install/` with bundled ICU 60 libraries
- Initialized database cluster at `/home/z/my-project/data/pg/`
- Created `genova` user and database with md5 authentication
- Created mini-service at `/home/z/my-project/mini-services/pg-service/` for PostgreSQL lifecycle management
- Successfully ran `prisma db push` to create all tables in PostgreSQL

### 2. Analytics System (PRIORITÉ 6)

#### New Prisma Models
- **AgentUsage** (`agent_usage`): Tracks agent actions, tokens, duration, status
  - Indexes: `[agentId, createdAt]`, `[userId, createdAt]`
  - Relations: Agent (cascade), User (cascade)
- **AICost** (`ai_costs`): Tracks AI provider costs by provider/model
  - Fields: provider, model, promptTokens, completionTokens, totalTokens, costUsd, requestId
  - Indexes: `[userId, createdAt]`, `[provider, createdAt]`
- **UsageDaily** (`usage_daily`): Daily aggregated usage summaries
  - Unique constraint: `[userId, date]`
  - Fields: agentCount, taskCount, totalTokens, totalCostUsd, apiCalls
- **MonitoringEvent** (`monitoring_events`): System monitoring events
  - Fields: eventType, source, message, details (JSON), severity, resolved, resolvedAt
  - Indexes: `[userId, createdAt]`, `[eventType, severity]`

#### Relations Added to User Model
- `agentUsages AgentUsage[]`
- `aiCosts AICost[]`
- `usageDaily UsageDaily[]`
- `monitoringEvents MonitoringEvent[]`

#### Analytics Library (`src/lib/analytics.ts`)
- `trackAgentUsage()`: Creates AgentUsage records
- `trackAICost()`: Creates AICost records
- `aggregateDailyUsage()`: Aggregates today's data into UsageDaily (upsert)
- `logMonitoringEvent()`: Creates MonitoringEvent records

#### API Routes

1. **`/api/analytics/usage`** (GET)
   - Query params: `period` (7d/30d/90d), `agentId` (optional)
   - Returns daily usage data from UsageDaily or aggregates from AgentUsage/AICost
   - Includes totals summary

2. **`/api/analytics/costs`** (GET)
   - Query params: `period` (7d/30d/90d), `provider` (optional)
   - Returns AI cost breakdown by provider and model
   - Includes daily cost timeline

3. **`/api/analytics/agents`** (GET)
   - Returns per-agent usage stats: total actions, tokens, cost, duration, last active
   - Includes actions breakdown and global summary

4. **`/api/analytics/monitoring`** (GET/POST/PATCH)
   - GET: Query params: `severity`, `resolved`, `limit` (default 50)
   - POST: Create monitoring event (validates eventType, source, severity)
   - PATCH: Mark event as resolved (`{ eventId, resolved: true }`)

All routes use `applySecurity` and `secureResponse` from `@/lib/security` with `requireAuth: true`.
All routes include OPTIONS handler for CORS.

### 3. PostgreSQL Mini-Service (`mini-services/pg-service/`)
- Manages PostgreSQL server lifecycle (init, start, stop)
- Auto-creates database and user on first run
- Uses `bun --hot` for auto-restart on file changes

## Files Modified
- `prisma/schema.prisma` - PostgreSQL provider + all new models
- `.env` - PostgreSQL DATABASE_URL

## Files Created
- `src/lib/analytics.ts` - Analytics tracking library
- `src/app/api/analytics/usage/route.ts` - Usage analytics endpoint
- `src/app/api/analytics/costs/route.ts` - Cost analytics endpoint
- `src/app/api/analytics/agents/route.ts` - Per-agent analytics endpoint
- `src/app/api/analytics/monitoring/route.ts` - Monitoring events endpoint
- `mini-services/pg-service/index.ts` - PostgreSQL lifecycle service
- `mini-services/pg-service/package.json` - Service package config
- `scripts/start-pg.ts` - PostgreSQL startup script

## Lint Status
✅ All lint checks pass

## Notes
- PostgreSQL 17.2 is running on localhost:5432
- The `bun run db:push` requires `export DATABASE_URL="postgresql://genova:genova_secret@localhost:5432/genova?schema=public"` in the shell environment (the .env file is correct but Prisma CLI may pick up the old env var from the shell)
- The Next.js dev server will need to restart to pick up the PostgreSQL connection
