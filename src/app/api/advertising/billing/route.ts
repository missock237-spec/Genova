// ============================================================
// Gen3ia — API de facturation publicitaire (annonceurs)
// ------------------------------------------------------------
// Endpoint sécurisé (rôle admin / billing_admin) exposant :
//   GET  ?action=list           -> factures d'un annonceur
//   GET  ?action=get&id=        -> facture + lignes
//   GET  ?action=reconcile      -> rapprochement du spend par campagne
//   POST { action:'settings' }  -> enregistre règles de facturation
//   POST { action:'generate' }  -> génère une facture sur une période
//   POST { action:'status' }    -> transition d'état d'une facture
//
// S'appuie sur AdBillingEngine (src/lib/billing/ad-billing.ts).
// N'altère pas la route publicitaire principale existante.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { applySecurity, secureResponse } from '@/lib/security';
import { getAdBillingEngine } from '@/lib/billing/ad-billing';

export const dynamic = 'force-dynamic';
const log = createLogger('advertising-billing');
const engine = getAdBillingEngine();

function asDate(v: unknown): Date {
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_DATE');
  return d;
}

function authId(auth: { id?: string; userId?: string } | null): string {
  if (!auth) return '';
  return auth.id || auth.userId || '';
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    roles: ['admin', 'billing_admin', 'advertiser'],
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const q = request.nextUrl.searchParams;
  const action = q.get('action') || 'list';
  const advertiserId = q.get('advertiserId') || q.get('id') || authId(auth);

  try {
    switch (action) {
      case 'list': {
        const invoices = await engine.listInvoices(advertiserId);
        return NextResponse.json({ invoices });
      }
      case 'get': {
        const id = q.get('id');
        if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
        const r = await engine.getInvoice(id);
        return NextResponse.json(r);
      }
      case 'settings': {
        const settings = await engine.getBillingSettings(advertiserId);
        return NextResponse.json({ settings });
      }
      case 'spend': {
        const from = asDate(q.get('from'));
        const to = asDate(q.get('to'));
        const spend = await engine.calculateAdSpend(advertiserId, from, to);
        return NextResponse.json({ spend });
      }
      case 'reconcile': {
        const from = asDate(q.get('from'));
        const to = asDate(q.get('to'));
        const rows = await engine.reconcileAdSpend(advertiserId, from, to);
        return NextResponse.json({ reconciliation: rows });
      }
      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    log.error('billing_get_error', { error: String(error) });
    const msg = (error as Error).message || 'Erreur interne';
    if (msg === 'INVALID_DATE') {
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
    const { action, ...params } = body;

    switch (action) {
      case 'settings': {
        const settings = await engine.upsertBillingSettings(params as any);
        return NextResponse.json({ settings });
      }
      case 'generate': {
        const advertiserId = params.advertiserId || authId(auth);
        const periodStart = asDate(params.periodStart);
        const periodEnd = asDate(params.periodEnd);
        const result = await engine.generateInvoice({
          advertiserId,
          periodStart,
          periodEnd,
          campaignIds: params.campaignIds as string[] | undefined,
          issue: params.issue as boolean | undefined,
        });
        return NextResponse.json(result);
      }
      case 'status': {
        const id = params.id as string;
        const status = params.status as string;
        if (!id || !status) {
          return NextResponse.json({ error: 'id et status requis' }, { status: 400 });
        }
        const invoice = await engine.setInvoiceStatus(
          id,
          status as any,
          params.paidAt ? asDate(params.paidAt) : undefined,
        );
        return NextResponse.json({ invoice });
      }
      case 'payment-method': {
        const method = await engine.upsertPaymentMethod(params as any);
        return NextResponse.json({ method });
      }
      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    log.error('billing_post_error', { error: String(error) });
    const msg = (error as Error).message || '';
    if (msg === 'INVALID_DATE') {
      return NextResponse.json({ error: 'Paramètres de date invalides' }, { status: 400 });
    }
    if (msg === 'INVALID_BILLING_DAY') {
      return NextResponse.json({ error: 'billingDayOfMonth doit être entre 1 et 28' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
