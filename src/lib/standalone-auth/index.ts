// ============================================================
// Gen3ia — Standalone Auth (fallback sans Firebase)
// ============================================================
// Systeme d'authentification autonome utilisant Node.js crypto.
// Active automatiquement quand les variables Firebase sont absentes.
//
// Stockage hybride :
//   1. In-memory Map (rapide, persiste sur warm instances)
//   2. Fichier JSON /tmp (backup, survit aux restarts)
//   3. Le JWT cookie contient les donnees utilisateur pour que la
//      session fonctionne meme apres un cold start (sans store)
//
// Securite du secret JWT :
//   - Le secret provient EXCLUSIVEMENT de la variable d'environnement
//     STANDALONE_JWT_SECRET (64 carac. hex, obligatoire en production).
//   - Il n'est JAMAIS ecrit sur disque, meme en /tmp partage.
//   - En dev (NODE_ENV !== 'production'), un secret aleatoire en memoire
//     est accepte (perdu au cold start — acceptable en local).
//
// LIMITATION : Le login par mot de passe ne fonctionne que si le
// store est accessible (meme instance ou fichier partage).
// Pour la production multi-instance, configurez Firebase.
// ===========================================================

import { createHash, randomBytes, scryptSync, createHmac, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { cookies } from 'next/headers';

// ============================================================
// JWT Secret — Variable d'environnement obligatoire
// ============================================================
// Le secret N'EST JAMAIS stocke sur disque.
// En production, STANDALONE_JWT_SECRET doit etre defini (64 hex chars).
// En dev, un secret aleatoire en memoire est genere (perdu au restart).
//
// IMPORTANT : La résolution est LAZY (paresseuse). Le secret n'est
// résolu qu'au premier appel de signJWT/verifyJWT (runtime), JAMAIS
// à l'import du module (build time). Cela évite que le build
// Next.js échoue si STANDALONE_JWT_SECRET n'est pas défini dans
// l'environnement de build Vercel.
// ============================================================

let _jwtSecret: string | null = null;

function getJwtSecret(): string {
  if (_jwtSecret !== null) return _jwtSecret;

  const envSecret = process.env.STANDALONE_JWT_SECRET;

  if (envSecret) {
    // Valider le format : exactement 64 caracteres hexadecimaux
    if (!/^[0-9a-f]{64}$/i.test(envSecret)) {
      throw new Error(
        '[standalone-auth] STANDALONE_JWT_SECRET doit contenir exactement 64 caracteres hexadecimaux. ' +
        'Generez un avec : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    _jwtSecret = envSecret;
    return _jwtSecret;
  }

  // En production, le secret est OBLIGATOIRE (mais seulement au runtime,
  // pas pendant le build Next.js où les modules sont importés sans que
  // les fonctions de signing/verification ne soient appelées).
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[standalone-auth] STANDALONE_JWT_SECRET n\'est pas defini. ' +
      'En production, cette variable d\'environnement est obligatoire. ' +
      'Generez un secret avec : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
      'et ajoutez-le aux variables d\'environnement Vercel.'
    );
  }

  // En dev, secret aleatoire en memoire (perdu au cold start)
  console.warn(
    '[standalone-auth] STANDALONE_JWT_SECRET non defini — utilisation d\'un secret aleatoire en memoire. ' +
    'Les sessions seront invalidees au prochain redemarrage. ' +
    'Definissez STANDALONE_JWT_SECRET pour la persistance.'
  );
  _jwtSecret = randomBytes(32).toString('hex');
  return _jwtSecret;
}

// ============================================================
// Types
// ============================================================

export interface StandaloneUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  avatar: string | null;
  emailVerified: boolean;
  plan: string;
  role: string;
  credits: number;
  isActive: boolean;
  isCreator: boolean;
  creatorEarnings: number;
  creatorWithdrawn: number;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
}

export interface StandaloneSession {
  userId: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  credits: number;
  avatar: string | null;
  emailVerified: boolean;
  iat: number;
  exp: number;
}

interface UserStore {
  users: Record<string, StandaloneUser>;
  emailIndex: Record<string, string>;
}

// ============================================================
// Configuration
// ============================================================

const JWT_ALGORITHM = 'HS256';
const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // 14 jours
const SESSION_MAX_AGE_SHORT = 60 * 60 * 24; // 24 heures
export const SESSION_COOKIE_NAME = 'gen3ia_session';
const DATA_DIR = '/tmp/gen3ia-auth';
const DATA_FILE = join(DATA_DIR, 'users.json');

// ============================================================
// Detection Firebase
// ============================================================

export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
  );
}

export function isFirebaseClientConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  );
}

// ============================================================
// User Store (In-memory + File)
// ============================================================

let memoryStore: UserStore | null = null;

function getMemoryStore(): UserStore {
  if (!memoryStore) {
    memoryStore = loadFromFile();
  }
  return memoryStore;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFromFile(): UserStore {
  ensureDataDir();
  if (existsSync(DATA_FILE)) {
    try {
      return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
    } catch {
      // Corrupted
    }
  }
  return { users: {}, emailIndex: {} };
}

function saveToFile(store: UserStore): void {
  ensureDataDir();
  try {
    writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('[standalone-auth] Failed to save to file:', err);
  }
}

function persistStore(): void {
  if (memoryStore) saveToFile(memoryStore);
}

function generateId(): string {
  return createHash('sha256').update(randomBytes(16).toString('hex') + Date.now().toString()).digest('hex').slice(0, 28);
}

// ============================================================
// Password Hashing (scrypt)
// ============================================================

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || randomBytes(16).toString('hex');
  const hash = scryptSync(
    password, actualSalt, SCRYPT_KEY_LENGTH,
    { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION }
  ).toString('hex');
  return { hash, salt: actualSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = scryptSync(
    password, salt, SCRYPT_KEY_LENGTH,
    { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION }
  ).toString('hex');
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

// ============================================================
// JWT (HMAC-SHA256)
// ============================================================

function base64urlEncode(data: string): string {
  return Buffer.from(data, 'utf-8').toString('base64url');
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

export function signJWT(payload: Record<string, unknown>, expiresIn: number = SESSION_MAX_AGE): string {
  const header = { alg: JWT_ALGORITHM, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + Math.floor(expiresIn / 1000) };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(fullPayload));
  const signature = createHmac('sha256', getJwtSecret())
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyJWT(token: string): StandaloneSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signature] = parts;

    // Verification avec le secret JWT (env var, jamais sur disque)
    const expectedSig = createHmac('sha256', getJwtSecret())
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    let isValid = false;
    try {
      isValid = timingSafeEqual(
        Buffer.from(signature, 'base64url'),
        Buffer.from(expectedSig, 'base64url'),
      );
    } catch {
      // timingSafeEqual échoue si les buffers ont des tailles différentes
    }

    if (!isValid) return null;

    const payload = JSON.parse(base64urlDecode(payloadB64));
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload as StandaloneSession;
  } catch {
    return null;
  }
}

// ============================================================
// User CRUD
// ============================================================

export function createUser(data: {
  email: string;
  password: string;
  name: string;
}): { user: StandaloneUser; token: string } {
  const store = getMemoryStore();
  const email = data.email.toLowerCase().trim();

  if (store.emailIndex[email]) {
    throw Object.assign(new Error('Cet email est deja utilise.'), { status: 409 });
  }

  const id = generateId();
  const { hash, salt } = hashPassword(data.password);
  const now = new Date().toISOString();

  const user: StandaloneUser = {
    id, email, name: data.name.trim(),
    passwordHash: hash, salt,
    avatar: null, emailVerified: false,
    plan: 'free', role: 'user', credits: 100,
    isActive: true, isCreator: false,
    creatorEarnings: 0, creatorWithdrawn: 0,
    createdAt: now, updatedAt: now, lastActiveAt: now,
  };

  store.users[id] = user;
  store.emailIndex[email] = id;
  persistStore();

  // Le JWT contient les donnees utilisateur SANS les credentials.
  // Le login par mot de passe nécessite le store (mémoire + fichier).
  // Pour la production multi-instance, configurez Firebase.
  const token = signJWT({
    sub: id, uid: id, userId: id,
    email: user.email, name: user.name,
    role: user.role, plan: user.plan,
    credits: user.credits, avatar: user.avatar,
    emailVerified: user.emailVerified,
  });

  return { user, token };
}

/**
 * Authentifie un utilisateur.
 * Strategie :
 *   1. Cherche dans le store (memoire + fichier)
 *   2. Si non trouve, c'est un cold start : on ne peut pas
 *      verifier le mot de passe sans le hash stocke.
 */
export function authenticateUser(email: string, password: string): { user: StandaloneUser; token: string } | null {
  const store = getMemoryStore();
  const normalizedEmail = email.toLowerCase().trim();
  const userId = store.emailIndex[normalizedEmail];

  if (!userId) {
    // Utilisateur non trouve dans le store local.
    // En mode standalone sur Vercel multi-instance, c'est un cas
    // connu apres un cold start. Le store se reconstruit au prochain
    // register sur cette instance.
    console.warn('[standalone-auth] User not found in local store:', normalizedEmail,
      '(cold start or different instance)');
    return null;
  }

  const user = store.users[userId];
  if (!user || !user.isActive) return null;

  if (!verifyPassword(password, user.passwordHash, user.salt)) return null;

  user.lastActiveAt = new Date().toISOString();
  user.updatedAt = new Date().toISOString();
  store.users[userId] = user;
  persistStore();

  const token = signJWT({
    sub: user.id, uid: user.id, userId: user.id,
    email: user.email, name: user.name,
    role: user.role, plan: user.plan,
    credits: user.credits, avatar: user.avatar,
    emailVerified: user.emailVerified,
  });

  return { user, token };
}

export function getUserById(id: string): StandaloneUser | null {
  const store = getMemoryStore();
  return store.users[id] || null;
}

export function getUserByEmail(email: string): StandaloneUser | null {
  const store = getMemoryStore();
  const userId = store.emailIndex[email.toLowerCase().trim()];
  return userId ? (store.users[userId] || null) : null;
}

// ============================================================
// Session Management
// ============================================================

export async function setStandaloneSessionCookie(token: string, rememberMe?: boolean): Promise<void> {
  const cookieStore = await cookies();
  const maxAge = rememberMe ? SESSION_MAX_AGE : SESSION_MAX_AGE_SHORT;
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export async function clearStandaloneSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getStandaloneSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

// ============================================================
// Server Session (compatible Firebase auth.ts interface)
// ============================================================

export interface ServerSession {
  user: {
    id: string; uid: string; email: string;
    name: string; role: string;
    picture?: string | null; emailVerified: boolean;
  };
}

export async function getStandaloneServerSession(): Promise<ServerSession | null> {
  const token = await getStandaloneSessionCookie();
  if (!token) return null;

  const session = verifyJWT(token);
  if (!session) return null;

  // Le JWT contient les donnees utilisateur, donc la session
  // fonctionne meme apres un cold start (sans store).
  // On evite de lire le store si le JWT est valide.
  return {
    user: {
      id: session.userId, uid: session.userId,
      email: session.email, name: session.name,
      role: session.role, picture: session.avatar,
      emailVerified: session.emailVerified,
    },
  };
}

// ============================================================
// Password validation
// ============================================================

export function validatePasswordStrength(password: string): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (password.length < 8) reasons.push('Minimum 8 caracteres');
  if (!/[A-Z]/.test(password)) reasons.push('Au moins une majuscule');
  if (!/[a-z]/.test(password)) reasons.push('Au moins une minuscule');
  if (!/[0-9]/.test(password)) reasons.push('Au moins un chiffre');
  return { valid: password.length >= 8 && reasons.length <= 1, reasons };
}