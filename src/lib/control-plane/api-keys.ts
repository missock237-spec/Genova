// ============================================================
// Gen3ia — Gestion des Clés API
// ============================================================
//  Création, listing, révocation et validation des clés API.
//  Les clés sont stockées dans la collection `api_keys` de Firestore.
//
//  Sécurité :
//    - La clé en clair n'est renvoyée qu'une seule fois (à la création).
//    - La version hachée (SHA-256) est stockée en base pour validation.
//    - Le préfixe `g3_` permet d'identifier visuellement les clés Gen3ia.
//    - Les clés expirent selon la durée configurée (défaut : 90 jours).
// ============================================================

import { createHash, randomBytes } from 'crypto';
import { db } from '@/lib/db';

/**
 * Spécifications pour la création d'une clé API.
 *
 * @property name - Nom descriptif de la clé (ex: "Production Backend").
 * @property userId - Identifiant du propriétaire de la clé.
 * @property permissions - Liste des permissions accordées par cette clé.
 * @property expiresIn - Durée de vie en secondes (défaut : 90 jours).
 *   La valeur `0` signifie « sans expiration ».
 * @property rateLimit - Limite de requêtes par minute (optionnel).
 */
export interface ApiKeySpecs {
  name: string;
  userId: string;
  permissions: string[];
  expiresIn?: number;
  rateLimit?: number;
}

/**
 * Résultat de la création d'une clé API.
 * La clé en clair (`key`) n'est renvoyée qu'une seule fois.
 *
 * @property key - Clé API en clair (préfixe `g3_`). Ne jamais persister.
 * @property id - Identifiant du document Firestore.
 */
export interface ApiKeyCreateResult {
  key: string;
  id: string;
}

/**
 * Représentation masquée d'une clé API pour le listing.
 * Seuls les 8 premiers et 4 derniers caractères sont visibles.
 */
export interface ApiKeyMasked {
  id: string;
  name: string;
  /** Clé masquée (ex: `g3_a1b2c3...x9y8`). */
  keyPreview: string;
  permissions: string[];
  rateLimit: number | null;
  isActive: boolean;
  createdAt: unknown;
  expiresAt: unknown | null;
  lastUsed: unknown | null;
}

/**
 * Résultat de la validation d'une clé API.
 * Retourné par `validateApiKey` pour le middleware de sécurité.
 */
export interface ApiKeyValidation {
  userId: string;
  keyId: string;
  permissions: string[];
}
/**
 * Hache une clé API avec SHA-256.
 * Le hachage est utilisé pour le stockage et la comparaison.
 *
 * @param key - Clé API en clair.
 * @returns Hachage hexadécimal (64 caractères).
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Génère une clé API aléatoire préfixée avec `g3_`.
 * Entropie : 32 octets aléatoires = 64 caractères hexadécimaux.
 *
 * @returns Clé API en clair (format `g3_<64 caractères hex>`).
 */
function generateApiKey(): string {
  const bytes = randomBytes(32);
  const hex = bytes.toString('hex');
  return `g3_${hex}`;
}

/**
 * Masque une clé API pour l'affichage dans le listing.
 * Ne montre que les 8 premiers et 4 derniers caractères.
 *
 * @param key - Clé API en clair.
 * @returns Version masquée (ex: `g3_a1b2c3d4...9z8y7x6w`).
 */
function maskKey(key: string): string {
  if (key.length <= 16) return '****';
  const prefix = key.slice(0, 12);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Durée de vie par défaut d'une clé API en secondes (90 jours).
 */
const DEFAULT_EXPIRY_SECONDS = 90 * 24 * 60 * 60;

// ============================================================
// API publique
// ============================================================

/**
 * Crée une nouvelle clé API.
 * Génère une clé aléatoire, la hache pour le stockage, et
 * renvoie la clé en clair (uniquement à la création).
 *
 * @param specs - Spécifications de la clé à créer.
 * @returns Clé en clair et identifiant du document.
 * @throws {Error} Si le nom est vide ou si la limite de clés est atteinte.
 *
 * @example
 * ```ts
 * const { key, id } = await createApiKey({
 *   name: 'Production',
 *   userId: 'uid123',
 *   permissions: ['agents:read', 'agents:execute'],
 *   expiresIn: 30 * 24 * 60 * 60, // 30 jours
 * });
 * // Afficher `key` à l'utilisateur — il ne pourra plus la revoir.
 * ```
 */
export async function createApiKey(specs: ApiKeySpecs): Promise<ApiKeyCreateResult> {
  if (!specs.name?.trim()) {
    throw new Error('API_KEY_NAME_REQUIRED: le nom de la clé est obligatoire');
  }

  const plainKey = generateApiKey();
  const hashedKey = hashApiKey(plainKey);
  const now = new Date();
  const expirySeconds = specs.expiresIn ?? DEFAULT_EXPIRY_SECONDS;
  const expiresAt = expirySeconds > 0
    ? new Date(now.getTime() + expirySeconds * 1000)
    : null;

  // Limite de 10 clés actives par utilisateur
  const existingKeys = await db.apiKey.count({
    where: [
      { field: 'userId', op: '==', value: specs.userId },
      { field: 'isActive', op: '==', value: true },
    ],
  });

  if (existingKeys >= 10) {
    throw new Error(
      'API_KEY_LIMIT_REACHED: limite de 10 clés actives atteinte pour cet utilisateur',
    );
  }

  const doc = await db.apiKey.create({
    data: {
      name: specs.name.trim(),
      userId: specs.userId,
      keyValueHash: hashedKey,
      keyPrefix: plainKey.slice(0, 12),
      permissions: specs.permissions,
      rateLimit: specs.rateLimit ?? null,
      isActive: true,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    },
  }) as Record<string, unknown>;

  return {
    key: plainKey,
    id: doc.id as string,
  };
}

/**
 * Liste les clés API d'un utilisateur.
 * Les clés sont masquées (seuls les préfixe/suffixe sont visibles).
 *
 * @param userId - Identifiant du propriétaire.
 * @returns Tableau des clés API masquées, triées par date de création décroissante.
 *
 * @example
 * ```ts
 * const keys = await listApiKeys(userId);
 * // keys[0].keyPreview === 'g3_a1b2c3d4...9z8y'
 * ```
 */
export async function listApiKeys(userId: string): Promise<ApiKeyMasked[]> {
  const keys = await db.apiKey.findMany({
    where: { userId },
    orderBy: [{ field: 'createdAt', direction: 'desc' }],
    limit: 50,
  });

  return (keys as Record<string, unknown>[]).map((k) => {
    const keyPrefix = (k.keyPrefix as string) || 'g3_********';
    const keyPreview = `${keyPrefix}...????`;
    return {
      id: k.id as string,
      name: k.name as string,
      keyPreview,
      permissions: (k.permissions as string[]) || [],
      rateLimit: (k.rateLimit as number) ?? null,
      isActive: k.isActive as boolean ?? true,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt ?? null,
      lastUsed: k.lastUsed ?? null,
    };
  });
}

/**
 * Révoque une clé API (désactivation logique).
 * La clé n'est pas supprimée physiquement pour conserver l'historique.
 *
 * @param keyId - Identifiant du document de la clé.
 * @param userId - Identifiant du propriétaire (vérification d'appartenance).
 * @returns `true` si la révocation a réussi, `false` si la clé n'existe pas ou n'appartient pas à l'utilisateur.
 *
 * @example
 * ```ts
 * const revoked = await revokeApiKey(keyId, userId);
 * if (!revoked) {
 *   return NextResponse.json({ error: 'Clé introuvable' }, { status: 404 });
 * }
 * ```
 */
export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
 try {
    // Vérifie l'existence et l'appartenance
    const key = await db.apiKey.findUnique({
      where: { id: keyId },
    }) as Record<string, unknown> | null;

    if (!key || (key.userId as string) !== userId) {
      return false;
    }

    await db.apiKey.update({
      where: { id: keyId },
      data: {
        isActive: false,
        revokedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Valide une clé API et retourne les informations de session associées.
 * Utilisé par le middleware de sécurité (`applySecurity` dans `@/lib/security`).
 *
 * La validation vérifie :
 * 1. Que le hachage SHA-256 correspond à un document actif.
 * 2. Que la clé n'est pas expirée.
 * 3. Que la clé n'est pas révoquée.
 *
 * @param key - Clé API en clair (reçue dans le header `X-API-Key`).
 * @returns Informations de validation ou `null` si la clé est invalide.
 *
 * @example
 * ```ts
 * const result = await validateApiKey(requestApiKey);
 * if (!result) {
 *   return NextResponse.json({ error: 'Clé API invalide' }, { status: 401 });
 * }
 * // result.userId, result.permissions disponibles
 * ```
 */
export async function validateApiKey(
  key: string,
): Promise<ApiKeyValidation | null> {
  try {
    const hashedKey = hashApiKey(key);

    const doc = await db.apiKey.findFirst({
      where: [
        { field: 'keyValueHash', op: '==', value: hashedKey },
        { field: 'isActive', op: '==', value: true },
      ],
      limit: 1,
    }) as Record<string, unknown> | null;

    if (!doc) return null;

    // Vérifie l'expiration
    const expiresAt = doc.expiresAt as Date | null;
    if (expiresAt) {
      const expiryTime = expiresAt instanceof Date
        ? expiresAt.getTime()
        : new Date(expiresAt as string).getTime();
      if (Date.now() > expiryTime) {
        return null;
      }
    }

    // Met à jour lastUsed de manière asynchrone (non-bloquant)
    db.apiKey
      .update({
        where: { id: doc.id as string },
        data: { lastUsed: new Date() },
      })
      .catch(() => { /* non-bloquant */ });

    return {
      userId: doc.userId as string,
      keyId: doc.id as string,
      permissions: (doc.permissions as string[]) || [],
    };
  } catch {
    return null;
  }
}
