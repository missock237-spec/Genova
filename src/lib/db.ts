/**
 * Database — Prisma Client Singleton
 *
 * Ensures the correct DATABASE_URL is used even when a system-level
 * environment variable overrides the .env file (e.g. in shared hosting
 * or container environments where DATABASE_URL may point to SQLite).
 *
 * Resolution order:
 *   1. GENOVA_DATABASE_URL — explicit override for production deployments
 *   2. .env file — parsed directly via dotenv (bypasses system env)
 *   3. process.env.DATABASE_URL — system-level fallback
 */

import { PrismaClient } from '@prisma/client'

// ---------------------------------------------------------------------------
// Resolve the correct DATABASE_URL
// ---------------------------------------------------------------------------

function resolveDatabaseUrl(): string {
  // Priority 1: Explicit override
  if (process.env.GENOVA_DATABASE_URL) {
    return process.env.GENOVA_DATABASE_URL;
  }

  // Priority 2: Read from .env file directly to bypass system env override
  if (typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.startsWith('postgresql://')) {
    // The system env is already correct — use it
    return process.env.DATABASE_URL;
  }

  // The system DATABASE_URL is wrong (e.g. SQLite or empty).
  // Parse .env manually to get the correct PostgreSQL URL.
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const match = trimmed.match(/^DATABASE_URL\s*=\s*(.+)$/);
        if (match) {
          const url = match[1].trim().replace(/^["']|["']$/g, '');
          if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
            return url;
          }
        }
      }
    }
  } catch {
    // Fall through to default
  }

  // Priority 3: System env fallback (may be wrong, but let Prisma handle the error)
  return process.env.DATABASE_URL || '';
}

const databaseUrl = resolveDatabaseUrl();

// Override the system env so Prisma uses the correct URL
// This must happen before PrismaClient instantiation
if (databaseUrl && databaseUrl.startsWith('postgresql')) {
  process.env.DATABASE_URL = databaseUrl;
}

// ---------------------------------------------------------------------------
// Prisma Client Singleton
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl || undefined,
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
