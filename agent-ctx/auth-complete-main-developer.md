# Task: PRIORITÉ 1 — Auth complète

## Agent: Main Developer
## Task ID: auth-complete

## Summary of Changes

### 1. Email Verification System

#### Prisma Schema Updates (`prisma/schema.prisma`)
- Added `emailVerified DateTime?` field to `User` model
- Added `EmailVerification` model with fields: id, email, code, attempts, used, expiresAt, createdAt, userId
- Added `emailVerifications` relation to User model

#### New Route: `/api/auth/verify-email` (POST)
- Accepts `{ email, code }`
- Timing-safe code comparison using `crypto.timingSafeEqual`
- Max 3 attempts, increments on each failed attempt
- On success: marks verification as used, sets `user.emailVerified = new Date()`, invalidates other unused codes
- Rate limit: 5 per 60s

#### New Route: `/api/auth/resend-verification` (POST)
- Accepts `{ email }`
- Resends verification code if email not yet verified
- Invalidates previous unused codes before creating new one
- Rate limit: 3 per 60s
- Always returns same response to prevent enumeration

#### Updated Register Route (`/api/auth/register`)
- After creating user, generates 6-digit verification code
- Creates `EmailVerification` entry in DB
- Sends verification email via `sendEmail()`
- Returns `emailVerificationRequired: true` in response
- Now captures IP address and user agent for session tracking
- Now sets both session and refresh cookies

### 2. Refresh Token System

#### Prisma Schema Updates
- Enhanced `Session` model with new fields:
  - `refreshToken String? @unique`
  - `refreshExpiresAt DateTime?`
  - `lastAccessedAt DateTime @default(now())`
  - `ipAddress String?`
  - `userAgent String?`

#### Updated `src/lib/session.ts`
- Added `REFRESH_TOKEN_DURATION_HOURS = 168` (7 days)
- Added `createRefreshToken()` function
- Updated `createSession()` to return `{ token, refreshToken }` and accept IP/UA options
- Added `refreshSession(refreshToken)` function that validates and rotates tokens
- Added `extractRefreshToken()` - checks cookie then X-Refresh-Token header
- Added `setRefreshCookie()` - sets `genova_refresh` cookie with 7-day expiry
- Added `refreshSessionCookie()` - sets both session and refresh cookies
- Updated `clearSessionCookie()` to also clear `genova_refresh` cookie
- Added `deleteSessionByRefreshToken()` for logout
- `validateSession()` now updates `lastAccessedAt` on each access

#### New Route: `/api/auth/refresh` (POST)
- Reads `genova_refresh` cookie or `X-Refresh-Token` header
- Calls `refreshSession()` to validate and rotate tokens
- Returns new session tokens in cookies
- Rate limit: 20 per 60s

#### Updated Login Route
- Now creates refresh token alongside session token
- Sets both `genova_session` and `genova_refresh` cookies
- Captures IP address and user agent
- Returns `emailVerified` status in response

#### Updated Logout Route
- Also clears refresh token cookie
- Also deletes session by refresh token from DB
- Uses direct `db` import instead of dynamic import

### 3. Multi-Session Management

#### New Route: `/api/auth/sessions`
- **GET** (requires auth): Returns list of active sessions
  - Includes: id, createdAt, lastAccessedAt, ipAddress (masked), userAgent (masked/truncated)
  - Identifies current session with `current: true` flag
  - Does NOT return tokens
- **DELETE** (requires auth): `{ sessionId }` - deletes specific session
  - Cannot delete current session (must use /auth/logout)
  - Validates session belongs to requesting user
  - Creates activity log entry

#### Updated Login Route
- Removed `deleteAllUserSessions` call - now allows multiple concurrent sessions

### 4. Middleware Updates
- Added `/api/auth/verify-email`, `/api/auth/resend-verification`, `/api/auth/refresh` to PUBLIC_ROUTES

### 5. Minor Updates
- Updated `/api/auth/me` to include `emailVerified` in the response
- Changed datasource from PostgreSQL back to SQLite (the init script had changed it)
- Fixed DATABASE_URL to use existing SQLite database

## Files Created
- `/home/z/my-project/src/app/api/auth/verify-email/route.ts`
- `/home/z/my-project/src/app/api/auth/resend-verification/route.ts`
- `/home/z/my-project/src/app/api/auth/refresh/route.ts`
- `/home/z/my-project/src/app/api/auth/sessions/route.ts`

## Files Modified
- `/home/z/my-project/prisma/schema.prisma`
- `/home/z/my-project/src/lib/session.ts`
- `/home/z/my-project/src/app/api/auth/register/route.ts`
- `/home/z/my-project/src/app/api/auth/login/route.ts`
- `/home/z/my-project/src/app/api/auth/logout/route.ts`
- `/home/z/my-project/src/app/api/auth/me/route.ts`
- `/home/z/my-project/src/middleware.ts`
- `/home/z/my-project/.env` (DATABASE_URL fix)

## Test Results
All endpoints tested successfully:
- Register returns `emailVerificationRequired: true`
- Verify-email with correct code works, timing-safe comparison works
- Verify-email with wrong code shows attempts remaining
- Max attempts exceeded blocks further attempts
- Resend-verification returns same response for existing/non-existing emails
- Login sets both session and refresh cookies
- Refresh endpoint rotates tokens
- Sessions GET returns masked data with current session flag
- Sessions DELETE revokes other sessions, blocks deleting current
- Logout clears both cookies
- /me endpoint includes emailVerified
- Lint passes cleanly
