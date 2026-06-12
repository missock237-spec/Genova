/**
 * Auth Config — Centralized management of authentication secrets.
 * Ensures fallback between AUTH_SECRET, NEXTAUTH_SECRET and JWT_SECRET
 * for maximum compatibility and easier production configuration.
 */

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is missing. Please check your .env file.');
  }
  return secret;
}

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || getAuthSecret();
}

export function getAuthSalt(): string {
  const salt = process.env.AUTH_SALT;
  if (!salt) {
    throw new Error('AUTH_SALT environment variable is missing. Please check your .env file.');
  }
  return salt;
}

export function getEncryptionKey(): string {
  const key = process.env.MCP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!key) {
    throw new Error('Encryption key (MCP_ENCRYPTION_KEY or AUTH_SECRET) is missing.');
  }
  return key;
}
