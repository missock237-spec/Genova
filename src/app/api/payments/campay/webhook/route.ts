// ============================================================
// POST /api/payments/campay/webhook — DÉSACTIVÉ
// ============================================================
//  Campay a été retiré du périmètre de paiement.
//  Aucun webhook Campay ne doit plus être traité.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('campay-webhook');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  log.warn('campay_webhook_disabled');
  return NextResponse.json(
    { error: 'Campay a été retiré. Ce webhook est désactivé.' },
    { status: 503 }
  );
}
