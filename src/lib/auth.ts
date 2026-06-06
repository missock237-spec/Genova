/**
 * Auth — Password Hashing, Verification, Token Utilities & RBAC
 *
 * Security improvements over the previous global-salt approach:
 * - Each password hash uses a unique random salt (32 bytes)
 * - Salt is stored within the hash string itself (format: pbkdf2:iterations:salt:hash)
 * - Legacy global-salt hashes are still supported for backward compatibility
 *   and automatically migrated on next successful login
 * - Timing-safe comparison prevents timing attacks
 * - verifyPassword now returns { valid, needsMigration } for auto-migration
 * - New token utilities for reset/session tokens with PBKDF2 hashing
 */

import crypto from 'crypto';
import { promisify } from 'util';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth');

const pbkdf2Async = promisify(crypto.pbkdf2);

const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';
const SALT_LENGTH = 32; // 32 bytes = 64 hex chars
const PREFIX = 'pbkdf2:';     // Current format: pbkdf2:iterations:salt:hash
const LEGACY_PREFIX = 'sha256:'; // Legacy: sha256:hash (global salt)
const GLOBAL_SALT_PREFIX = 'gs:'; // Old global-salt format: gs:iterations:hash

function getGlobalSalt(): string {
  const salt = process.env.AUTH_SALT;
  if (!salt) {
    throw new Error('AUTH_SALT environment variable is required');
  }
  return salt;
}

/**
 * Generate a cryptographically secure random salt (hex string).
 */
function generateSalt(): string {
  return crypto.randomBytes(SALT_LENGTH).toString('hex');
}

/**
 * Derive a key using PBKDF2 with the given salt.
 */
function deriveKey(password: string, salt: string, iterations: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, KEY_LENGTH, DIGEST, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Hash a password with a unique per-user salt.
 *
 * Output format: pbkdf2:100000:<salt_hex>:<derived_key_hex>
 * The salt is embedded in the hash so no separate storage is needed.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length === 0) {
    throw new Error('Password must not be empty');
  }

  const salt = generateSalt();
  const derivedKey = await deriveKey(password, salt, ITERATIONS);
  return `${PREFIX}${ITERATIONS}:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a password against a stored hash.
 *
 * Returns { valid, needsMigration } instead of just boolean.
 * Supports multiple legacy formats for auto-migration.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<{ valid: boolean; needsMigration: boolean }> {
  if (!password || !hash) return { valid: false, needsMigration: false };

  // Current format: pbkdf2:iterations:salt:derivedKey
  if (hash.startsWith(PREFIX)) {
    const parts = hash.slice(PREFIX.length).split(':');
    if (parts.length === 3) {
      const iterations = parseInt(parts[0], 10);
      const salt = parts[1];
      const storedKey = parts[2];

      const derivedKey = await deriveKey(password, salt, iterations);

      const storedBuf = Buffer.from(storedKey, 'hex');
      if (storedBuf.length !== derivedKey.length) return { valid: false, needsMigration: false };
      const valid = crypto.timingSafeEqual(storedBuf, derivedKey);
      // Needs migration if iterations are outdated
      const needsMigration = valid && iterations < ITERATIONS;
      return { valid, needsMigration };
    }

    // Fallback: old format without embedded salt (gs:iterations:hash)
    if (parts.length === 2) {
      const iterations = parseInt(parts[0], 10);
      const storedKey = parts[1];
      const salt = getGlobalSalt();

      const derivedKey = await deriveKey(password, salt, iterations);

      const storedBuf = Buffer.from(storedKey, 'hex');
      if (storedBuf.length !== derivedKey.length) return { valid: false, needsMigration: false };
      const valid = crypto.timingSafeEqual(storedBuf, derivedKey);
      return { valid, needsMigration: valid };
    }
  }

  // Legacy v2 format: gs:iterations:hash (global salt)
  if (hash.startsWith(GLOBAL_SALT_PREFIX)) {
    const parts = hash.slice(GLOBAL_SALT_PREFIX.length).split(':');
    const iterations = parseInt(parts[0], 10);
    const storedKey = parts[1];
    const salt = getGlobalSalt();

    const derivedKey = await deriveKey(password, salt, iterations);

    const storedBuf = Buffer.from(storedKey, 'hex');
    if (storedBuf.length !== derivedKey.length) return { valid: false, needsMigration: false };
    const valid = crypto.timingSafeEqual(storedBuf, derivedKey);
    return { valid, needsMigration: valid };
  }

  // Legacy v1 format: sha256:hash (PBKDF2 SHA-256 with global salt)
  if (hash.startsWith(LEGACY_PREFIX)) {
    const storedKey = hash.slice(LEGACY_PREFIX.length);
    const salt = getGlobalSalt();

    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, 'sha256', (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    const legacyBuf = Buffer.from(storedKey, 'hex');
    const legacyHexBuf = Buffer.from(derivedKey.toString('hex').slice(0, storedKey.length), 'hex');
    if (legacyBuf.length !== legacyHexBuf.length) return { valid: false, needsMigration: false };
    const valid = crypto.timingSafeEqual(legacyBuf, legacyHexBuf);
    return { valid, needsMigration: valid };
  }

  // Original format: simple SHA-256 + hardcoded salt (most legacy)
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'genova-salt-2024');
  const computed = await crypto.subtle.digest('SHA-256', data);
  const computedHex = Array.from(new Uint8Array(computed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const hashBuf = Buffer.from(hash, 'hex');
  const computedBuf = Buffer.from(computedHex, 'hex');
  if (hashBuf.length !== computedBuf.length) return { valid: false, needsMigration: false };
  const valid = crypto.timingSafeEqual(hashBuf, computedBuf);
  return { valid, needsMigration: valid };
}

/**
 * Check if a hash needs migration to the new per-user salt format.
 * Returns true for any hash that doesn't use the current format.
 */
export function needsMigration(hash: string): boolean {
  // Current format: pbkdf2:iterations:salt:hash (3 colons after prefix)
  if (hash.startsWith(PREFIX)) {
    const parts = hash.slice(PREFIX.length).split(':');
    return parts.length !== 3; // Needs migration if it's the old 2-part format
  }
  return true; // All other formats need migration
}

// ─── RESET TOKEN UTILITIES ───────────────────────────────────────────────────

/** Generate a cryptographically secure URL-safe reset token (48 bytes = 96 hex chars) */
export function generateResetToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

/** Generate a session token (48 bytes = 96 hex chars) */
export function generateSessionToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

/** PBKDF2-hash a reset token for safe storage in DB */
export async function hashToken(token: string): Promise<string> {
  const salt = Buffer.from('genova_token_salt_v1'); // fixed salt for tokens is acceptable
  const hash = await pbkdf2Async(token, salt, 10000, 32, 'sha256');
  return hash.toString('hex');
}

/** Timing-safe comparison for tokens */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// ============================================================
// RBAC — Role-Based Access Control
// ============================================================

export type UserRole = 'user' | 'admin' | 'super_admin';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
};

/**
 * Check if a user with the given role has at least the required role level.
 */
export function hasRole(userRole: string, requiredRole: UserRole): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as UserRole] ?? -1;
  const requiredLevel = ROLE_HIERARCHY[requiredRole];
  return userLevel >= requiredLevel;
}

/**
 * Check if a user has admin or super_admin privileges.
 */
export function isAdmin(userRole: string): boolean {
  return hasRole(userRole, 'admin');
}

/**
 * Validate that a role string is valid.
 */
export function isValidRole(role: string): role is UserRole {
  return role in ROLE_HIERARCHY;
}

// ============================================================
// Audit Logging — Security event trail
// ============================================================

interface AuditLogParams {
  userId: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  severity?: 'info' | 'warning' | 'critical';
}

/**
 * Create an audit log entry for security-sensitive actions.
 * This persists to the AuditLog table for compliance and investigation.
 */
export async function createAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const { db } = await import('@/lib/db');
    await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        resource: params.resource || '',
        resourceId: params.resourceId || '',
        details: JSON.stringify(params.details || {}),
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        severity: params.severity || 'info',
      },
    });
  } catch (error) {
    // Audit logging must never block the main flow
    log.error('Failed to create audit log', {
      action: params.action,
      userId: params.userId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
}
