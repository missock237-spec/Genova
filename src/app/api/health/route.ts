// ============================================================
// GET /api/health — Health check (connectivité + uptime + version)
// ============================================================
// Utilisé par le service worker, les monitoring externes, et le
// système d'auto-update pour vérifier la disponibilité du serveur.
// Léger, pas de DB, pas de log.
// ============================================================

import { NextResponse } from 'next/server';

// [server-04] Edge runtime — pas de DB, que des env vars + calculs simples
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const startTime = Date.now();

export async function GET() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID || '';
  const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || 'unknown';
  const buildEnv = process.env.NEXT_PUBLIC_BUILD_ENV || process.env.NODE_ENV || 'unknown';

  return NextResponse.json({
    status: 'ok',
    version,
    buildId,
    gitSha,
    environment: buildEnv,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-App-Version': version,
      'X-Build-Id': buildId,
    },
  });
}