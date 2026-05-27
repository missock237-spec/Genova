// Auth Utilities — Secure password hashing with PBKDF2
// Uses Web Crypto API (no external dependencies needed)
// Each password gets a unique salt for rainbow table resistance
// Supports migration from legacy SHA-256 hashes with multiple salt candidates

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 32; // bytes
const KEY_LENGTH = 64; // bytes

function arrayToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToArray(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

function generateSalt(): Promise<string> {
  const salt = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(salt);
  return Promise.resolve(arrayToHex(salt.buffer));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await generateSalt();
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToArray(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
  const hash = arrayToHex(derivedBits);
  return `${salt}:${hash}`;
}

/**
 * Get all possible legacy salts to try during verification.
 * Supports migration from previous hardcoded salts and environment salts.
 * Returns an array of salt candidates — verification tries each one.
 */
function getLegacySaltCandidates(): string[] {
  const candidates: string[] = [];

  // 1. Current ENCRYPTION_SALT from environment (highest priority)
  const envSalt = process.env.ENCRYPTION_SALT;
  if (envSalt) {
    candidates.push(envSalt);
  }

  // 2. Previous hardcoded salt that was used before the env var was required
  // (Users registered before the fix used this salt)
  candidates.push('genova-default-salt-2024');

  // 3. Alternative salt from .env.local
  candidates.push('genova-salt-2025-secure');

  return candidates;
}

/**
 * Verify a legacy SHA-256 hash by trying all known salt candidates.
 * Returns true if any salt produces a matching hash.
 */
async function verifyLegacyHash(password: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const saltCandidates = getLegacySaltCandidates();

  for (const salt of saltCandidates) {
    const data = encoder.encode(password + salt);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const legacyHash = Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (legacyHash === storedHash) {
      return true;
    }
  }

  return false;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Support legacy SHA-256 hashes (migration path)
  if (!storedHash.includes(':')) {
    return verifyLegacyHash(password, storedHash);
  }

  // New PBKDF2 hash format: salt:hash
  const [salt, hash] = storedHash.split(':');
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToArray(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
  const computedHash = arrayToHex(derivedBits);
  return computedHash === hash;
}

/**
 * Migrate a legacy SHA-256 hash to PBKDF2 after successful verification.
 * Call this after verifyPassword returns true for a legacy hash.
 * Returns the new PBKDF2 hash, or null if the hash was already PBKDF2.
 */
export async function migrateToPBKDF2(password: string, storedHash: string): Promise<string | null> {
  // Only migrate legacy hashes (without colon separator)
  if (storedHash.includes(':')) return null;

  // Generate a new PBKDF2 hash
  return hashPassword(password);
}
