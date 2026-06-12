/**
 * Auth Config — Centralized management of authentication secrets.
 * Ensures fallback between AUTH_SECRET, NEXTAUTH_SECRET and JWT_SECRET
 * for maximum compatibility and easier production configuration.
 */

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET environment variable is missing in production');
  }
  return secret || 'genova-dev-secret-key-32-chars-minimum-length';
}

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || getAuthSecret();
}

export function getAuthSalt(): string {
  const salt = process.env.AUTH_SALT;
  if (!salt && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SALT environment variable is missing in production');
  }
  return salt || '506e789c629f64923e597c45873995f571348888b58a1f736034f7833896504a';
}

export function getEncryptionKey(): string {
  return process.env.MCP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'genova-mcp-encryption-key-32ch';
}
