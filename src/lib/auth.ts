import crypto from 'crypto';

const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';
const LEGACY_DIGEST = 'sha256';
const PREFIX = 'pbkdf2:';
const LEGACY_PREFIX = 'sha256:';

function getAuthSalt(): string {
  const salt = process.env.AUTH_SALT;
  if (!salt) {
    throw new Error('AUTH_SALT environment variable is required');
  }
  return salt;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = getAuthSalt();
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `${PREFIX}${ITERATIONS}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith(PREFIX)) {
    const parts = hash.slice(PREFIX.length).split(':');
    const iterations = parseInt(parts[0], 10);
    const storedKey = parts[1];
    const salt = getAuthSalt();

    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(password, salt, iterations, KEY_LENGTH, DIGEST, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    const storedBuf = Buffer.from(storedKey, 'hex');
    if (storedBuf.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(storedBuf, derivedKey);
  }

  if (hash.startsWith(LEGACY_PREFIX)) {
    const storedKey = hash.slice(LEGACY_PREFIX.length);
    const salt = getAuthSalt();

    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, LEGACY_DIGEST, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    const legacyBuf = Buffer.from(storedKey, 'hex');
    const legacyHexBuf = Buffer.from(derivedKey.toString('hex').slice(0, storedKey.length), 'hex');
    if (legacyBuf.length !== legacyHexBuf.length) return false;
    return crypto.timingSafeEqual(legacyBuf, legacyHexBuf);
  }

  // Legacy SHA-256 simple hash (original implementation)
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'agentos-salt-2024');
  const computed = await crypto.subtle.digest('SHA-256', data);
  const computedHex = Array.from(new Uint8Array(computed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const hashBuf = Buffer.from(hash, 'hex');
  const computedBuf = Buffer.from(computedHex, 'hex');
  if (hashBuf.length !== computedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, computedBuf);
}

export function needsMigration(hash: string): boolean {
  // Returns true if the hash is from a legacy format that should be re-hashed
  return !hash.startsWith(PREFIX);
}
