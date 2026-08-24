// GET /api/security/safety-health — Vérifie l'état du moteur de sécurité
// Administrateur uniquement.
import { NextResponse } from 'next/server';
import { withAuth, type RouteParams } from '@/lib/with-auth';
import { getSecurityHealth, isRustSafetyAvailable } from '@/lib/security/agent-security-middleware';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_request, _ctx, auth) => {
  // Restreint aux admins
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'Admin uniquement' }, { status: 403 });
  }

  const health = getSecurityHealth();
  const overall = health.rustAvailable ? 'healthy' : (health.jsFallbackEnabled ? 'degraded' : 'critical');

  return NextResponse.json({
    status: overall,
    rustSafetyAvailable: health.rustAvailable,
    jsFallbackEnabled: health.jsFallbackEnabled,
    defaultAllowedToolsCount: health.defaultAllowedTools.length,
    hardBlockedToolsCount: health.hardBlockedTools.length,
    hardBlockedTools: health.hardBlockedTools,
    defaultAllowedTools: health.defaultAllowedTools,
    timestamp: new Date().toISOString(),
  });
}, {
  requireAuth: true,
  roles: ['admin'],
});
