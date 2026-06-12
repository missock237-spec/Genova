/**
 * Secret Vault — Encrypted secret/key manager for API keys and credentials
 *
 * Provides AES-256-GCM encryption for storing secrets in the database.
 * Uses the existing AccessKey model's `keyValue` field for encrypted data.
 * Master key derived from VAULT_MASTER_KEY environment variable.
 *
 * Security guarantees:
 * - AES-256-GCM authenticated encryption (confidentiality + integrity)
 * - Per-secret random IV (no IV reuse)
 * - Master key never logged or exposed
 * - Audit logging for every access
 * - Master key rotation support (re-encrypts all secrets)
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { getAuthSecret } from "@/lib/auth-config";
import { createAuditLog } from '@/lib/auth';

const log = createLogger('secret-vault');

// ============================================================
// Constants
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;   // 128-bit IV for GCM
const TAG_LENGTH = 16;  // 128-bit authentication tag
const KEY_LENGTH = 32;  // 256-bit key

// ============================================================
// Types
// ============================================================

export interface SecretMetadata {
  service: string;
  keyType: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt?: Date | null;
  isActive: boolean;
}

// ============================================================
// Secret Vault
// ============================================================

export class SecretVault {
  private static instance: SecretVault | null = null;
  private masterKey: Buffer;

  private constructor(masterKey: Buffer) {
    this.masterKey = masterKey;
  }

  /**
   * Initialize the vault with the master key from VAULT_MASTER_KEY env var.
   * The env var should be a 64-character hex string (32 bytes).
   *
   * Falls back to deriving a key from NEXTAUTH_SECRET if VAULT_MASTER_KEY
   * is not set, but this is not recommended for production.
   */
  static initialize(): SecretVault {
    if (SecretVault.instance) {
      return SecretVault.instance;
    }

    const masterKeyHex = process.env.VAULT_MASTER_KEY;

    let key: Buffer;

    if (masterKeyHex && masterKeyHex.length === 64 && /^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
      // Use the provided 32-byte hex key directly
      key = Buffer.from(masterKeyHex, 'hex');
    } else if (masterKeyHex) {
      // Derive a proper 32-byte key from the provided value using SHA-256
      key = crypto.createHash('sha256').update(masterKeyHex).digest();
      log.warn('VAULT_MASTER_KEY is not a 64-char hex string — deriving key via SHA-256. Use a proper 64-char hex key in production.');
    } else if (getAuthSecret()) {
      // Fallback: derive from NEXTAUTH_SECRET
      key = crypto.createHash('sha256').update('vault:' + getAuthSecret()).digest();
      log.warn('VAULT_MASTER_KEY not set — deriving from NEXTAUTH_SECRET. Set VAULT_MASTER_KEY for proper secret isolation.');
    } else {
      // Last resort: deterministic key (NOT secure — development only)
      key = crypto.createHash('sha256').update('genova-vault-dev-key-do-not-use-in-production').digest();
      log.error('No VAULT_MASTER_KEY or NEXTAUTH_SECRET set — using insecure development key. NEVER use this in production!');
    }

    SecretVault.instance = new SecretVault(key);
    log.info('Secret vault initialized');
    return SecretVault.instance;
  }

  /**
   * Get the singleton vault instance. Initializes if not yet done.
   */
  static getInstance(): SecretVault {
    if (!SecretVault.instance) {
      return SecretVault.initialize();
    }
    return SecretVault.instance;
  }

  /**
   * Reset the singleton (for testing or key rotation).
   */
  static resetInstance(): void {
    SecretVault.instance = null;
  }

  // -----------------------------------------------------------------------
  // Secret CRUD
  // -----------------------------------------------------------------------

  /**
   * Encrypt and store a secret in the database.
   * Uses the AccessKey model's keyValue field for encrypted data.
   *
   * @returns The ID of the created AccessKey record
   */
  async storeSecret(
    userId: string,
    service: string,
    keyType: string,
    plaintext: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!plaintext || plaintext.length === 0) {
      throw new Error('Secret value cannot be empty');
    }

    if (plaintext.length > 10000) {
      throw new Error('Secret value too long (max 10000 characters)');
    }

    const encryptedValue = this.encrypt(plaintext);

    // Check if a secret for this service already exists for the user
    const existing = await db.accessKey.findFirst({
      where: { userId, service },
    });

    if (existing) {
      // Update the existing secret
      await db.accessKey.update({
        where: { id: existing.id },
        data: {
          keyValue: encryptedValue,
          keyType,
          metadata: JSON.stringify(metadata || {}),
          isActive: true,
        },
      });

      await this.auditAccess(userId, 'vault_secret_updated', existing.id, {
        service,
        keyType,
      });

      log.info('Secret updated', { userId, service, keyType });
      return existing.id;
    }

    // Create a new secret
    const accessKey = await db.accessKey.create({
      data: {
        name: `Vault: ${service}`,
        description: `Encrypted secret for ${service}`,
        service,
        keyType,
        keyValue: encryptedValue,
        metadata: JSON.stringify(metadata || {}),
        isActive: true,
        userId,
      },
    });

    await this.auditAccess(userId, 'vault_secret_stored', accessKey.id, {
      service,
      keyType,
    });

    log.info('Secret stored', { userId, service, keyType, id: accessKey.id });
    return accessKey.id;
  }

  /**
   * Retrieve and decrypt a secret from the database.
   * Returns null if the secret doesn't exist or is inactive.
   *
   * WARNING: The returned value is the plaintext secret.
   * Never expose this to the client — server-side use only.
   */
  async getSecret(userId: string, service: string): Promise<string | null> {
    const accessKey = await db.accessKey.findFirst({
      where: { userId, service, isActive: true },
    });

    if (!accessKey) {
      return null;
    }

    // Check expiration
    if (accessKey.expiresAt && accessKey.expiresAt < new Date()) {
      log.warn('Attempted to access expired secret', {
        userId,
        service,
        expiresAt: accessKey.expiresAt,
      });
      return null;
    }

    try {
      const plaintext = this.decrypt(accessKey.keyValue);

      // Update lastUsedAt
      await db.accessKey.update({
        where: { id: accessKey.id },
        data: { usageCount: { increment: 1 } },
      });

      await this.auditAccess(userId, 'vault_secret_accessed', accessKey.id, {
        service,
      });

      return plaintext;
    } catch (error) {
      log.error('Failed to decrypt secret', {
        userId,
        service,
        error: error instanceof Error ? error.message : 'Unknown',
      });

      await this.auditAccess(userId, 'vault_secret_decrypt_failed', accessKey.id, {
        service,
        error: error instanceof Error ? error.message : 'Decryption failed',
      });

      return null;
    }
  }

  /**
   * Delete a secret from the vault.
   */
  async deleteSecret(userId: string, service: string): Promise<boolean> {
    const accessKey = await db.accessKey.findFirst({
      where: { userId, service },
    });

    if (!accessKey) {
      return false;
    }

    await db.accessKey.delete({
      where: { id: accessKey.id },
    });

    await this.auditAccess(userId, 'vault_secret_deleted', accessKey.id, {
      service,
    });

    log.info('Secret deleted', { userId, service });
    return true;
  }

  /**
   * List all secrets for a user without revealing their values.
   * Returns metadata only — names, types, dates.
   */
  async listSecrets(userId: string): Promise<SecretMetadata[]> {
    const accessKeys = await db.accessKey.findMany({
      where: { userId },
      select: {
        service: true,
        keyType: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        isActive: true,
        usageCount: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return accessKeys.map((key) => ({
      service: key.service,
      keyType: key.keyType,
      createdAt: key.createdAt,
      lastUsedAt: key.usageCount > 0 ? key.updatedAt : null,
      expiresAt: key.expiresAt,
      isActive: key.isActive,
    }));
  }

  // -----------------------------------------------------------------------
  // Master Key Rotation
  // -----------------------------------------------------------------------

  /**
   * Rotate the master key by re-encrypting all secrets.
   *
   * This decrypts all secrets with the current master key and
   * re-encrypts them with the new key. Returns the number of
   * secrets re-encrypted.
   *
   * @param newMasterKeyHex - New master key as 64-char hex string
   * @returns Number of secrets re-encrypted
   */
  async rotateMasterKey(newMasterKeyHex: string): Promise<number> {
    if (!newMasterKeyHex || !/^[0-9a-fA-F]{64}$/.test(newMasterKeyHex)) {
      throw new Error('New master key must be a 64-character hex string (32 bytes)');
    }

    const newKey = Buffer.from(newMasterKeyHex, 'hex');

    // Fetch all access keys
    const allKeys = await db.accessKey.findMany({
      select: { id: true, keyValue: true, userId: true, service: true },
    });

    let reEncrypted = 0;
    let failed = 0;

    for (const key of allKeys) {
      try {
        // Decrypt with old key
        const plaintext = this.decrypt(key.keyValue);

        // Encrypt with new key
        const newEncrypted = this.encryptWithKey(plaintext, newKey);

        // Update in database
        await db.accessKey.update({
          where: { id: key.id },
          data: { keyValue: newEncrypted },
        });

        reEncrypted++;
      } catch (error) {
        failed++;
        log.error('Failed to re-encrypt secret during rotation', {
          keyId: key.id,
          service: key.service,
          userId: key.userId,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    // Swap the master key in memory
    this.masterKey = newKey;

    // Audit the rotation
    await createAuditLog({
      userId: 'system',
      action: 'vault_master_key_rotated',
      resource: 'vault',
      details: {
        totalSecrets: allKeys.length,
        reEncrypted,
        failed,
      },
      severity: 'critical',
    });

    log.info('Master key rotation completed', {
      total: allKeys.length,
      reEncrypted,
      failed,
    });

    if (failed > 0) {
      throw new Error(
        `Master key rotation partially failed: ${failed}/${allKeys.length} secrets could not be re-encrypted. ` +
        'These secrets may have been encrypted with a different key or may be corrupted.'
      );
    }

    return reEncrypted;
  }

  // -----------------------------------------------------------------------
  // Encryption / Decryption (AES-256-GCM)
  // -----------------------------------------------------------------------

  /**
   * Encrypt a plaintext string using AES-256-GCM.
   * Output format: iv:authTag:ciphertext (all hex-encoded)
   */
  private encrypt(plaintext: string): string {
    return this.encryptWithKey(plaintext, this.masterKey);
  }

  /**
   * Encrypt with a specific key (used during key rotation).
   */
  private encryptWithKey(plaintext: string, key: Buffer): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_LENGTH,
    });

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a ciphertext string using AES-256-GCM.
   * Input format: iv:authTag:ciphertext (all hex-encoded)
   */
  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format — expected iv:authTag:encrypted');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedData = parts[2];

    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
    }
    if (authTag.length !== TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: expected ${TAG_LENGTH}, got ${authTag.length}`);
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // -----------------------------------------------------------------------
  // Audit
  // -----------------------------------------------------------------------

  private async auditAccess(
    userId: string,
    action: string,
    resourceId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      await createAuditLog({
        userId,
        action,
        resource: 'vault',
        resourceId,
        details,
        severity: action.includes('failed') || action.includes('deleted')
          ? 'warning'
          : 'info',
      });
    } catch {
      // Audit logging must never block the main flow
    }
  }
}
