// Auth Utilities — Secure password hashing with PBKDF2
// Uses Web Crypto API (no external dependencies needed)
// Each password gets a unique salt for rainbow table resistance

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

// Lazy-loaded legacy salt — read once from env, fail loudly if missing
let _legacySalt: string | null = null;
function getLegacySalt(): string {
  if (_legacySalt === null) {
    _legacySalt = process.env.ENCRYPTION_SALT || '';
    if (!_legacySalt) {
      throw new Error(
        'ENCRYPTION_SALT environment variable is required. ' +
        'Set it before starting the server. Example: ENCRYPTION_SALT=$(openssl rand -hex 32)'
      );
    }
  }
  return _legacySalt;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Support legacy SHA-256 hashes (migration path)
  if (!storedHash.includes(':')) {
    // Legacy SHA-256 hash — verify using old method then rehash
    const encoder = new TextEncoder();
    const salt = getLegacySalt();
    const data = encoder.encode(password + salt);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const legacyHash = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return legacyHash === storedHash;
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
