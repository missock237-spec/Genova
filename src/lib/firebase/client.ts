// ============================================================
// Gen3ia — Firebase Client SDK (navigateur uniquement)
// ============================================================
//  Singleton initialisé côté client.
//  À importer dans les composants React / hooks / client-side.
//
//  [bundle-05] Firestore, Storage, Messaging, Analytics sont importés
//  dynamiquement dans leurs getters pour réduire le JS initial (~60-100KB).
//  Seuls firebase/app et firebase/auth sont importés statiquement
//  (nécessaires pour l'initialisation eager de l'auth).
// ============================================================

'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';

import { firebaseConfig } from './config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: ReturnType<typeof import('firebase/firestore').getFirestore> | null = null;
let storage: ReturnType<typeof import('firebase/storage').getStorage> | null = null;
let messaging: ReturnType<typeof import('firebase/messaging').getMessaging> | null = null;
let analytics: ReturnType<typeof import('firebase/analytics').getAnalytics> | null = null;

function initApp(): FirebaseApp {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  return app;
}

function initAuth(a: FirebaseApp): Auth {
  try {
    return getAuth(a);
  } catch {
    return initializeAuth(a, { persistence: indexedDBLocalPersistence });
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (!app) app = initApp();
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = initAuth(getFirebaseApp());
  return auth;
}

// [bundle-05] Import dynamique — firestore n'est chargé que si getFirebaseDb() est appelé
export async function getFirebaseDb() {
  if (!db) {
    const { getFirestore } = await import('firebase/firestore');
    db = getFirestore(getFirebaseApp(), 'gen3ia');
  }
  return db;
}

// [bundle-05] Import dynamique — storage
export async function getFirebaseStorage() {
  if (!storage) {
    const { getStorage } = await import('firebase/storage');
    storage = getStorage(getFirebaseApp());
  }
  return storage;
}

// [bundle-05] Import dynamique — messaging
export async function getFirebaseMessaging() {
  if (typeof window === 'undefined') return null;
  if (!messaging) {
    try {
      const { getMessaging, isSupported } = await import('firebase/messaging');
      const supported = await isSupported();
      if (!supported) return null;
      messaging = getMessaging(getFirebaseApp());
    } catch {
      return null;
    }
  }
  return messaging;
}

// [bundle-05] Import dynamique — analytics
export async function getFirebaseAnalytics() {
  if (typeof window === 'undefined') return null;
  if (!analytics) {
    try {
      const { getAnalytics, isSupported } = await import('firebase/analytics');
      const supported = await isSupported();
      if (!supported) return null;
      analytics = getAnalytics(getFirebaseApp());
    } catch {
      return null;
    }
  }
  return analytics;
}

// ---------------------------------------------------------------
// Validation de la configuration Firebase côté client.
// ---------------------------------------------------------------
export function isFirebaseClientConfigured(): { ok: boolean; missing: string[] } {
  const required: Array<{ key: string; value: string | undefined }> = [
    { key: 'NEXT_PUBLIC_FIREBASE_API_KEY', value: firebaseConfig.apiKey },
    { key: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', value: firebaseConfig.authDomain },
    { key: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', value: firebaseConfig.projectId },
    { key: 'NEXT_PUBLIC_FIREBASE_APP_ID', value: firebaseConfig.appId },
  ];
  const missing = required.filter(r => !r.value).map(r => r.key);
  return { ok: missing.length === 0, missing };
}

let _initError: string | null = null;

/** Retourne l'erreur d'initialisation Firebase si elle s'est produite. */
export function getFirebaseInitError(): string | null {
  return _initError;
}

// ---------------------------------------------------------------
// Initialisation EAGER de app + auth uniquement.
// Les autres services sont lazy (import dynamique).
// ---------------------------------------------------------------
if (typeof window !== 'undefined') {
  try {
    const configCheck = isFirebaseClientConfigured();
    if (!configCheck.ok) {
      _initError = `Configuration Firebase manquante: ${configCheck.missing.join(', ')}`;
      console.error('[firebase/client]', _initError);
    } else {
      getFirebaseApp();
      getFirebaseAuth();
    }
  } catch (err) {
    _initError = err instanceof Error ? err.message : 'Erreur d\'initialisation Firebase';
    console.error('[firebase/client] eager init failed:', err);
  }
}

export const firebaseClient = {
  app: getFirebaseApp,
  auth: getFirebaseAuth,
  db: getFirebaseDb,
  storage: getFirebaseStorage,
  messaging: getFirebaseMessaging,
  analytics: getFirebaseAnalytics,
};

export default firebaseClient;
