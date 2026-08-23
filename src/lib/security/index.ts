/**
 * Security Module — Unified exports for AI security, file validation, and vault
 *
 * Provides:
 * - Class exports for advanced usage
 * - Convenience functions for common operations
 */

// Class exports
export { AISecurityEngine, getAISecurityEngine } from './ai-security';
export type {
  AIActionType,
  TokenLimitResult,
  CostLimitResult,
  PromptBlockResult,
  FileValidationResult as AIFileValidationResult,
  AIRateLimitResult,
  AISecurityRequest,
  AISecurityCheckResult,
} from './ai-security';

export { FileValidator } from './file-validator';
export type {
  FileValidationInput,
  ValidationResult,
  MalwareScanResult,
} from './file-validator';

export { SecretVault } from './vault';
export type { SecretMetadata } from './vault';

export { PromptValidator } from './prompt-validator';
export type { ValidationResult as PromptValidationResult } from './prompt-validator';

// Re-export rate limiter for convenience
export { RateLimiter } from './rate-limiter';

// ============================================================
// Convenience Functions
// ============================================================

import { getAISecurityEngine } from './ai-security';
import type { AISecurityRequest } from './ai-security';
import { FileValidator } from './file-validator';
import { SecretVault } from './vault';

/**
 * Run all AI security checks in a single call.
 * Convenience wrapper around AISecurityEngine.checkAll().
 */
export async function checkAISecurity(
  userId: string,
  request: AISecurityRequest
) {
  const engine = getAISecurityEngine();
  return engine.checkAll(userId, request);
}

/**
 * Validate a file upload for security compliance.
 * Convenience wrapper around FileValidator.validate().
 */
export function validateFileUpload(file: {
  name: string;
  size: number;
  type: string;
}) {
  const validator = new FileValidator();
  return validator.validate(file);
}

/**
 * Retrieve a decrypted secret from the vault.
 * Convenience wrapper around SecretVault.getSecret().
 *
 * WARNING: Returns plaintext — server-side use only.
 */
export async function getSecret(userId: string, service: string): Promise<string | null> {
  const vault = SecretVault.getInstance();
  return vault.getSecret(userId, service);
}

// Key Rotation
export { rotateMasterKey, verifyKey, getSecretRotationChecklist, generateNewMasterKey, keyFingerprint, type RotationReport } from './key-rotation';

// Auth convenience
import { getServerSession } from '@/lib/firebase/auth';
export { getServerSession } from '@/lib/firebase/auth';
export type { ServerSession } from '@/lib/firebase/auth';

/**
 * Get the authenticated user from the current session.
 * Convenience wrapper for API routes that need auth context.
 */
export async function getAuth(_request?: unknown): Promise<{ uid: string; email?: string; role?: string } | null> {
  const session = await getServerSession();
  return session ? { uid: session.user.uid, email: session.user.email, role: session.user.role } : null;
}
