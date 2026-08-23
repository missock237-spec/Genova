// ============================================================
// GET /api/auth/debug — Auth system diagnostic
// ============================================================
// Public endpoint that tests each auth component without
// requiring authentication. Returns detailed status info.
// ============================================================

import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, unknown> = { timestamp: new Date().toISOString() };

  // 1. Firebase Admin SDK
  try {
    const auth = getAdminAuth();
    const app = auth.app;
    results.adminApp = { ok: true, name: app.name, options: Object.keys(app.options) };

    // Test listUsers (minimal) to verify Admin SDK connectivity
    const start = Date.now();
    const listResult = await auth.listUsers(1);
    results.adminListUsers = {
      ok: true,
      latencyMs: Date.now() - start,
      userCount: listResult.users?.length ?? 0,
    };
  } catch (err) {
    results.adminApp = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 2. Environment variables (no values exposed, just presence)
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

  // 3. Firebase config validation (server-side, from config.ts)
  try {
    const { validateFirebaseConfig } = await import('@/lib/firebase/config');
    const check = validateFirebaseConfig();
    results.serverConfig = check;
  } catch (err) {
    results.serverConfig = { error: err instanceof Error ? err.message : String(err) };
  }

  // 4. Session cookie config
  try {
    const { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } = await import('@/lib/firebase/config');
    results.sessionConfig = {
      cookieName: SESSION_COOKIE_NAME,
      maxAge14d: SESSION_COOKIE_MAX_AGE,
    };
    // Also check SESSION_COOKIE_MAX_AGE_SHORT (exported from auth.ts)
    const { SESSION_COOKIE_MAX_AGE_SHORT } = await import('@/lib/firebase/auth');
    (results.sessionConfig as Record<string, unknown>).maxAge24h = SESSION_COOKIE_MAX_AGE_SHORT;
  } catch (err) {
    results.sessionConfig = { error: err instanceof Error ? err.message : String(err) };
  }

  // 5. Database connectivity (Firestore)
  try {
    const { db } = await import('@/lib/firebase/firestore');
    const start = Date.now();
    const testDoc = await db.user.findUnique({ where: { id: '__debug_nonexistent__' } });
    results.firestore = { ok: true, latencyMs: Date.now() - start, testResult: testDoc };
  } catch (err) {
    results.firestore = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 6. Test createSessionCookie with a dummy token (should fail gracefully)
  try {
    const { createSessionCookie } = await import('@/lib/firebase/auth');
    const start = Date.now();
    await createSessionCookie('invalid_test_token');
    results.createSessionCookieTest = { ok: false, note: 'Should have failed' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.createSessionCookieTest = {
      ok: true, // Expected to fail with invalid token
      expectedError: msg.slice(0, 100),
    };
  }

  return NextResponse.json(results);
}
