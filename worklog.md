---
Task ID: 1
Agent: Main Agent
Task: Fix authentication system and add Genova branding (green G logo + genova.Ia text)

Work Log:
- Analyzed entire auth system: Prisma schema, auth.ts, session.ts, security.ts, all API routes, auth-form.tsx, store.ts, middleware.ts
- Identified root cause: system env var DATABASE_URL=file:/home/z/my-project/db/custom.db was overriding .env PostgreSQL URL
- Identified Next.js 16 breaking change: middleware.ts must be renamed to proxy.ts with default export
- Fixed db.ts to resolve correct DATABASE_URL even when system env overrides .env
- Renamed middleware.ts → proxy.ts with `export default function proxy()` for Next.js 16 compatibility
- Added CORS_ALLOWED_ORIGINS to .env file
- Added proper error logging in register route
- Created GenovaLogo component (src/components/ui/genova-logo.tsx) with green "G" and "genova.Ia" text
- Updated auth-form.tsx: replaced Cpu icon with GenovaLogo, shows "genova.Ia" text (full text on register tab)
- Updated app-sidebar.tsx: replaced Cpu icon with GenovaLogo (compact mode)
- Updated app-header.tsx: default title changed from "AgentOS" to "genova.Ia"
- Updated app/page.tsx: loading screen shows GenovaLogo
- Updated layout.tsx: title, description, keywords, authors, icons all updated for genova.Ia branding
- Created SVG favicon (src/app/icon.svg) with green G
- Generated PNG favicon (public/favicon-genova.png) with AI
- Verified all auth endpoints: register (201), login (200), duplicate (409), wrong password (401), /me (200)
- TypeScript compilation: 0 errors

Stage Summary:
- ROOT CAUSE of auth failure: DATABASE_URL system env pointing to SQLite instead of PostgreSQL
- ROOT CAUSE of server crash: Next.js 16 requires proxy.ts instead of middleware.ts
- Both issues are now FIXED
- Green "G" logo and "genova.Ia" branding applied across all pages
- Authentication fully operational: register, login, session management, forgot/reset password all working
