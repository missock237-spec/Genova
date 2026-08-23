// ============================================================
// GET /api/auth/debug — Auth system diagnostic
// ============================================================

import { NextResponse } from 'next/server';
import { isFirebaseConfigured, isFirebaseClientConfigured } from '@/lib/standalone-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, unknown> = { timestamp: new Date().toISOString() };

  // 0. Auth mode
  results.authMode = isFirebaseConfigured() ? 'firebase' : 'standalone';
  results.clientFirebaseAvailable = isFirebaseClientConfigured();

  // 1. Environment variables (presence only)
  results.env = {
    hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    hasApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    hasAuthDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    hasAppId: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    nodeEnv: process.env.NODE_ENV,
  };

  // 2. Firebase Admin SDK (only if configured)
  if (isFirebaseConfigured()) {
    try {
      const { getAdminAuth } = await import('@/lib/firebase/admin');
      const auth = getAdminAuth();
      const app = auth.app;
      results.adminApp = { ok: true, name: app.name, options: Object.keys(app.options) };

      const start = Date.now();
      const listResult = await auth.listUsers({ maxResults: 1 });
      results.adminListUsers = { ok: true, latencyMs: Date.now() - start, userCount: listResult.users?.length ?? 0 };
    } catch (err) {
      results.adminApp = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    // Firestore
    try {
      const { db } = await import('@/lib/firebase/firestore');
      const start = Date.now();
      const testDoc = await db.user.findUnique({ where: { id: '__debug_nonexistent__' } });
      results.firestore = { ok: true, latencyMs: Date.now() - start, testResult: testDoc };
    } catch (err) {
      results.firestore = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    // Session config
    try {
      const { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } = await import('@/lib/firebase/config');
      results.sessionConfig = { cookieName: SESSION_COOKIE_NAME, maxAge14d: SESSION_COOKIE_MAX_AGE };
      const { SESSION_COOKIE_MAX_AGE_SHORT } = await import('@/lib/firebase/auth');
      (results.sessionConfig as Record<string, unknown>).maxAge24h = SESSION_COOKIE_MAX_AGE_SHORT;
    } catch (err) {
      results.sessionConfig = { error: err instanceof Error ? err.message : String(err) };
    }

    // Test createSessionCookie with dummy token
    try {
      const { createSessionCookie } = await import('@/lib/firebase/auth');
      await createSessionCookie('invalid_test_token');
      results.createSessionCookieTest = { ok: false, note: 'Should have failed' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.createSessionCookieTest = { ok: true, expectedError: msg.slice(0, 100) };
    }
  } else {
    results.adminApp = { ok: false, note: 'Firebase non configure — mode standalone actif' };
    results.firestore = { ok: false, note: 'Firebase non configure — mode standalone actif' };
    results.sessionConfig = { cookieName: 'gen3ia_session' };

    // Standalone store test
    try {
      const { getUserById } = await import('@/lib/standalone-auth');
      const test = getUserById('__nonexistent__');
      results.standaloneStore = { ok: true, testResult: test };
    } catch (err) {
      results.standaloneStore = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json(results);
}
