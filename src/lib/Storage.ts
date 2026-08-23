// ============================================================
// Gen3ia — Storage shim (DÉPRÉCIÉ)
// ============================================================
//  Ce module est obsolète. Il dupliquait src/lib/firebase/storage.ts
//  et contenait un bogue de compilation (import de `bucket` et `getApps`
//  inexistants depuis firebase-admin/storage).
//
//  → Utilisez désormais : import { ... } from '@/lib/firebase/storage'
//
//  Les anciens exports sont conservés sous forme de shims qui lèvent
//  une erreur explicite si un code résiduel les appelle, afin de ne pas
//  casser la structure du projet ni le build (aucun import invalide).
// ============================================================

const DEPRECATION =
  '[Storage] Ce module est déprécié — utilisez src/lib/firebase/storage.ts ' +
  '(bucket, uploadFile, deleteFile, getFileMetadata, etc.).';

/**
 * @deprecated Utilisez l'instance exposée par '@/lib/firebase/storage'.
 */
export const storage = new Proxy(
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
 * @deprecated Utilisez `bucket()` depuis '@/lib/firebase/storage'.
 */
export function getStorageInstance(): never {
  throw new Error(DEPRECATION);
}

/**
 * @deprecated Utilisez `defaultBucket` depuis '@/lib/firebase/storage'.
 */
export const defaultBucket = new Proxy(
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
 * @deprecated Utilisez `uploadFile` depuis '@/lib/firebase/storage'.
 */
export async function uploadFile(
  _fileBuffer: Buffer,
  _destination: string,
  _contentType?: string
): Promise<string> {
  throw new Error(DEPRECATION);
}

/**
 * @deprecated Utilisez `deleteFile` depuis '@/lib/firebase/storage'.
 */
export async function deleteFile(_destination: string): Promise<void> {
  throw new Error(DEPRECATION);
}

/**
 * @deprecated Utilisez `getFileMetadata` depuis '@/lib/firebase/storage'.
 */
export async function getFileMetadata(_destination: string): Promise<never> {
  throw new Error(DEPRECATION);
}
