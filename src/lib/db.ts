/**
 * Database — Prisma Client Singleton
 *
 * Ensures the correct DATABASE_URL is used even when a system-level
 * environment variable overrides the .env file.
 */

import { PrismaClient } from '@prisma/client'
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Resolve the correct DATABASE_URL
// ---------------------------------------------------------------------------

function resolveDatabaseUrl(): string {
  // Priority 1: Explicit override
  if (process.env.GENOVA_DATABASE_URL) {
    return process.env.GENOVA_DATABASE_URL;
  }

  // Priority 2: Read from system env if it's already a PostgreSQL URL
  if (typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.startsWith('postgresql://')) {
    return process.env.DATABASE_URL;
  }

  // Priority 3: Manual .env parsing as fallback (bypasses system-level SQLite overrides)
  try {
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
    // Silent fail, fall back to process.env
  }

  return process.env.DATABASE_URL || '';
}

const databaseUrl = resolveDatabaseUrl();

// Synchronously update process.env for Prisma
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
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
