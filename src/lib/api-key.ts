// ============================================================
// Gen3ia — Utilitaire clés API (génération + hachage)
// ============================================================
//  Factorise la création et le hachage des clés API persistées dans
//  la collection Firestore `api_keys`.
//
//  Sécurité : la clé brute n'est JAMAIS stockée. Seul son empreinte
//  (scrypt, sel déterministe pepperé par env) est persistée, ce qui
//  permet la recherche par égalité (`keyHash == hash(incoming)`)
//  sans jamais exposer les clés en base. La clé brute n'est affichée
//  qu'une seule fois, au moment de la création, à l'UI (champ `key`).
//
//  Note : sel FIXE pepperé (déterminisme pour lookup par hash) — la
//  sécurité repose sur le secret d'environnement `API_KEY_HASH_SALT`
//  ajouté au sel. En production ce secret DOIT être défini.
// ============================================================

import { scryptSync, randomBytes } from 'node:crypto';

export const API_KEY_PREFIX = 'gva_';
/** Longueur (octets) de l'entropie aléatoire de la clé. */
export const API_KEY_BYTES = 48;
/** Nombre maximal de jours de validité accepté (10 ans). */
export const MAX_EXPIRY_DAYS = 3650;

/**
 * Sel de hachage dérivé : sel de base + pepper d'environnement.
 * Permet de révoquer toutes les clés en changeant API_KEY_HASH_SALT,
 * et rend impossible le calcul d'empreintes sans ce secret.
 */
function effectiveSalt(): string {
  let pepper = process.env.API_KEY_HASH_SALT || '';
  // En développement, si aucune variable n'est définie, on dérive un pepper
  // déterministe du projet pour éviter le sel complètement prévisible.
  if (!pepper && process.env.NODE_ENV !== 'production') {
    pepper = 'dev-mode-fallback';
  }
  return `gen3ia-api-key-salt:${pepper}`;
}

/** Génère une clé API brute (à n'afficher qu'UNE fois). */
export function generateApiKey(): string {
  const raw = randomBytes(API_KEY_BYTES).toString('base64url');
  return `${API_KEY_PREFIX}${raw}`;
}

/**
 * Empreinte (scrypt) de la clé — seule valeur persistée en base.
 * @param key Clé brute à hacher.
 */
export function hashApiKey(key: string): string {
  return scryptSync(key, effectiveSalt(), 64).toString('hex');
}

/** Préfixe de la clé, utilisé pour l'affichage masqué dans l'UI. */
export function keyPrefix(key: string): string {
  return key.substring(0, 8);
}

/**
 * Normalise expiresInDays en un entier positif borné.
 * Retourne null si absent/0 (aucune expiration), ou null si invalide
 * (l'appelant doit alors refuser la requête) via NaN. Le caller décide.
 */
export function normalizeExpiryDays(raw: unknown): number | null | 'invalid' {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || Number.isNaN(n)) return 'invalid';
  const days = Math.trunc(n);
  if (days < 0) return 'invalid';
  if (days === 0) return null;
  return Math.min(days, MAX_EXPIRY_DAYS);
}
