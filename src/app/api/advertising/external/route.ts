// ============================================================
// Gen3ia — API de gestion du réseau publicitaire EXTERNE
// ------------------------------------------------------------
// Endpoint sécurisé (rôle admin) pour piloter la connexion au
// service de pub externe :
//   GET  ?action=status      -> état de la connexion + providers actifs
//   GET  ?action=campaigns   -> campagnes externes normalisées
//   POST { action:'sync' }   -> force la synchronisation des campagnes
//   POST { action:'reconcile' } -> spend externe facturable (rapprochement)
//
// S'appuie sur ExternalAdManager (src/lib/advertising/external/registry.ts).
// Sans aucune modification de la route publicitaire existante.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { applySecurity, secureResponse } from '@/lib/security';
import { getExternalAdManager } from '@/lib/advertising/external/registry';
import { loadExternalProviderConfig } from '@/lib/advertising/external/client';

export const dynamic = 'force-dynamic';
const log = createLogger('advertising-external');
const manager = getExternalAdManager();

function asDate(v: unknown): Date {
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_DATE');
  return d;
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    roles: ['admin', 'billing_admin'],
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const q = request.nextUrl.searchParams;
  const action = q.get('action') || 'status';

  try {
    switch (action) {
      case 'status': {
        const cfg = loadExternalProviderConfig();
        return NextResponse.json({
          configured: cfg.enabled && cfg.apiUrl.length > 0,
          providerId: cfg.id || null,
          enabledProviders: manager.enabledProviders,
        });
      }
      case 'campaigns': {
        const campaigns = await manager.getActiveExternalCampaigns();
        const res = NextResponse.json({ campaigns });
        return secureResponse(res, request);
      }
      case 'spend': {
        const from = asDate(q.get('from'));
        const to = asDate(q.get('to'));
        const r = await manager.reconcileExternalSpend(from, to);
        return NextResponse.json(r);
      }
      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    log.error('external_get_error', { error: String(error) });
    if ((error as Error).message === 'INVALID_DATE') {
      return NextResponse.json({ error: 'Paramètres from/to invalides' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    roles: ['admin', 'billing_admin'],
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    switch (action) {
      case 'sync': {
        const results = await manager.syncAll();
        return NextResponse.json({ results });
      }
      case 'reconcile': {
        const from = asDate(body.from);
        const to = asDate(body.to);
        const r = await manager.reconcileExternalSpend(from, to);
        return NextResponse.json(r);
      }
      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    log.error('external_post_error', { error: String(error) });
    if ((error as Error).message === 'INVALID_DATE') {
      return NextResponse.json({ error: 'Paramètres de date invalides' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
