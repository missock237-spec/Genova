---
Task ID: 1
Agent: Main Agent
Task: Production security fixes for Genova

Work Log:
- Fixed hardcoded ENCRYPTION_SALT fallback in auth.ts — now fails loudly if env var is missing
- Updated .env with proper salt value, SMTP config, and APP_URL
- Changed next.config.ts: ignoreBuildErrors = false, reactStrictMode = true
- Changed tsconfig.json: noImplicitAny = true
- Migrated session token from Bearer header to httpOnly cookie (session.ts)
  - Cookie: genova_session, httpOnly=true, Secure (prod), SameSite=Strict, maxAge=24h
  - Bearer header fallback still supported for backward compatibility
- Updated login/register routes to set httpOnly cookie via setSessionCookie()
- Updated logout route to clear httpOnly cookie via clearSessionCookie()
- Updated login route with Zod validation (loginSchema) and rate limiting (RATE_LIMITS.login)
- Created src/lib/api.ts — centralized apiFetch utility with credentials: 'include'
- Updated src/lib/store.ts — added validateSession() for httpOnly cookie validation on startup
- Updated auth-form.tsx — added forgot password flow, uses apiFetch with credentials
- Added PasswordReset model to Prisma schema (6-digit code, 15min expiry, max 3 attempts)
- Created src/lib/email.ts — SMTP email utility with dev console fallback
- Created /api/auth/forgot-password route — generates 6-digit code, sends via email
- Created /api/auth/reset-password route — verifies code, resets password, invalidates sessions
- Added forgotPasswordSchema and resetPasswordSchema to validation.ts
- Created src/components/settings/settings-view.tsx — shows inactive agents/workflows/guardrails
- Added 'settings' view to page.tsx viewComponents and store AppState
- Updated sidebar with Settings nav item and proper logout via API
- Updated dashboard-view.tsx — only shows active resources, credentials: 'include'
- Updated all 29 fetch() calls across 10 files with credentials: 'include' and removed userId params
- Installed nodemailer + @types/nodemailer for email support
- Generated Prisma client with new PasswordReset model

Stage Summary:
- All 6 production fixes completed
- Token is now in httpOnly cookie (XSS protection)
- Login has Zod validation + rate limiting
- Forgot password with email verification code (6-digit, 15min expiry)
- Dashboard shows only active agents, settings page for inactive resources
- TypeScript strict mode enabled (noImplicitAny: true, ignoreBuildErrors: false)
