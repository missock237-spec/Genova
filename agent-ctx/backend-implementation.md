# Backend Implementation - Genova Genova

## Summary
Created 27 production-ready backend files for the Genova Genova project, including authentication, session management, security middleware, email service, social accounts, WhatsApp integration, resources management, agent permissions, browser navigation, approvals workflow, and AI-powered agent chat.

## Files Created

### Library Files (5)
1. **`src/lib/auth.ts`** - PBKDF2 password hashing with AUTH_SALT (100k iterations, SHA-512, 64-byte key). Legacy SHA-256 support for migration. `hashPassword()`, `verifyPassword()`, `needsMigration()`.
2. **`src/lib/session.ts`** - Cookie-based session management with DB persistence. Functions: `createSession()`, `validateSession()`, `getAuthenticatedUser()`, `setSessionCookie()`, `clearSessionCookie()`, `extractToken()`, `deleteSession()`, `deleteAllUserSessions()`. Cookie name: `genova_session`.
3. **`src/lib/security.ts`** - CORS + in-memory sliding window rate limiter + auth middleware. `applyCorsHeaders()`, `checkRateLimit()`, `applySecurity()`, `secureResponse()`.
4. **`src/lib/email.ts`** - Multi-backend email service: Resend API → SMTP (nodemailer) → Console fallback.
5. **`src/lib/api.ts`** - Client-side fetch wrapper with `credentials: 'include'`, 401 handling.
6. **`src/lib/server-api.ts`** - Server-side API response helpers with CORS.

### Auth API Routes (6)
7. **`src/app/api/auth/login/route.ts`** - POST login with rate limit (5/15s), PBKDF2 verify, session creation, httpOnly cookie, password migration.
8. **`src/app/api/auth/register/route.ts`** - POST register with rate limit (10/min), validation, PBKDF2 hash, session creation.
9. **`src/app/api/auth/logout/route.ts`** - POST logout, deletes session, clears cookie.
10. **`src/app/api/auth/me/route.ts`** - GET current user (requires auth).
11. **`src/app/api/auth/forgot-password/route.ts`** - POST generates 6-digit code, 15min expiry, sends email, prevents enumeration.
12. **`src/app/api/auth/reset-password/route.ts`** - POST validates code (max 3 attempts), hashes new password, invalidates all sessions.

### Social API Routes (3)
13. **`src/app/api/social/accounts/route.ts`** - GET list, POST connect (youtube/facebook/instagram/tiktok/linkedin).
14. **`src/app/api/social/accounts/[id]/route.ts`** - DELETE disconnect (ownership check).
15. **`src/app/api/social/post/route.ts`** - POST create social post with approval flow.

### WhatsApp API Routes (3)
16. **`src/app/api/whatsapp/config/route.ts`** - GET/POST/PUT WhatsApp config.
17. **`src/app/api/whatsapp/send/route.ts`** - POST send message with approval flow.
18. **`src/app/api/whatsapp/call/route.ts`** - POST initiate call with approval flow.

### Resources API Routes (2)
19. **`src/app/api/resources/route.ts`** - GET list, POST add (cpu/api/mvp/database/storage).
20. **`src/app/api/resources/[id]/route.ts`** - PUT update, DELETE (ownership check).

### Agent API Routes (5)
21. **`src/app/api/agents/[id]/permissions/route.ts`** - GET/PUT 12 permission types with approval flags.
22. **`src/app/api/agents/[id]/browser/route.ts`** - GET state, POST navigate/click/type/screenshot/extract.
23. **`src/app/api/agents/[id]/chat/route.ts`** - POST chat with SSE streaming via z-ai-web-dev-sdk.
24. **`src/app/api/agents/[id]/execute/route.ts`** - POST execute task with approval flow.
25. **`src/app/api/agents/route.ts`** - Updated: GET (auth filtered), POST (creates default 12 permissions).

### Updated Routes (2)
26. **`src/app/api/agents/[id]/route.ts`** - Updated with auth checks.
27. **`src/app/api/agents/[id]/toggle/route.ts`** - Updated with auth checks.

### Approvals API Routes (2)
28. **`src/app/api/approvals/route.ts`** - GET pending approvals with status filter.
29. **`src/app/api/approvals/[id]/route.ts`** - POST approve/reject, executes action on approval.

### Dashboard Route (1)
30. **`src/app/api/dashboard/stats/route.ts`** - Updated with social accounts, pending approvals, browser sessions, WhatsApp status, resources stats.

## Key Design Decisions
- All routes use `applySecurity()` for consistent CORS + rate limiting + auth
- Password migration from legacy SHA-256 to PBKDF2 happens on login
- Approval workflow: actions requiring approval create `ApprovalRequest` entries
- Agent chat uses SSE streaming for real-time AI responses
- All routes return consistent error format: `{ error: string }`
- Cookie name: `genova_session`, httpOnly, SameSite=Lax, Secure in production
