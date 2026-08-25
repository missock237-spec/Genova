// ============================================================
// POST /api/payments/campay — DÉSACTIVÉ
// ============================================================
//  Campay a été retiré du périmètre de paiement.
//  Règle métier : 2 fournisseurs uniquement.
//   - CHARIOW  → abonnements (plans + packs de crédits)
//   - SEBPAY   → marketplace de prompts
//
//  Cette route répond 503 (Service Unavailable) afin d'éviter tout
//  paiement via un fournisseur non autorisé.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('campay-api');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  log.warn('campay_route_disabled');
  return NextResponse.json(
    { error: 'Campay a été retiré. Utilisez Chariow (abonnements) ou SebPay (marketplace).' },
    { status: 503 }
  );
}
