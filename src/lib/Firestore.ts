// ============================================================
// Gen3ia — Firestore shim (DÉPRÉCIÉ)
// ============================================================
//  Ce module est obsolète. Il dupliquait src/lib/firestore-extra.ts (le
//  véritable point d'accès central) et contenait un bogue de compilation :
//  `setCachedDoc` appelait `redis.del(...)` sans que `redis` soit importé.
//
//  → Utilisez désormais : import { db, FieldValue, ... } from '@/lib/firestore-extra'
//
//  Les anciens exports sont conservés sous forme de shims qui lèvent
//  une erreur explicite si un code résiduel les appelle, afin de ne pas
//  casser la structure du projet ni le build (aucun import invalide).
// ============================================================

const DEPRECATION =
  '[Firestore] Ce module est déprécié — utilisez src/lib/firestore-extra.ts' +
  '(db, FieldValue, getCachedDoc, setCachedDoc, getCachedQuery, etc.).';

/**
 * @deprecated Utilisez `db` depuis '@/lib/firestore-extra'.
 */
export function getDb(): never {
  throw new Error(DEPRECATION);
}

/**
 * @deprecated Utilisez `db` depuis '@/lib/firestore-extra'.
 */
export const db = new Proxy(
  {},
  {
    get() {
      throw new Error(DEPRECATION);
    },
    set() {
      throw new Error(DEPRECATION);
    },
  }
) as never;

/**
 * @deprecated Utilisez `FieldValue` depuis '@/lib/firestore-extra'.
 */
export const FieldValue = new Proxy(
  {},
  {
    get() {
      throw new Error(DEPRECATION);
    },
    set() {
      throw new Error(DEPRECATION);
    },
  }
) as never;

/**
 * @deprecated Utilisez `getCachedDoc` depuis '@/lib/firestore-extra'.
 */
export async function getCachedDoc<T>(
  _collection: string,
  _docId: string,
  _ttl?: number
): Promise<T | null> {
  throw new Error(DEPRECATION);
}

/**
 * @deprecated Utilisez `setCachedDoc` depuis '@/lib/firestore-extra'.
 */
export async function setCachedDoc<T>(
  _collection: string,
  _docId: string,
  _data: T,
  _options?: { merge?: boolean }
): Promise<void> {
  throw new Error(DEPRECATION);
}

/**
 * @deprecated Utilisez `getCachedQuery` depuis '@/lib/firestore-extra'.
 */
export async function getCachedQuery<T>(
  _queryKey: string,
  _queryFn: () => Promise<T[]>,
  _ttl?: number
): Promise<T[]> {
  throw new Error(DEPRECATION);
}
