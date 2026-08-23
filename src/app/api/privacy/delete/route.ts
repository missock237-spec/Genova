// ============================================================
// DELETE /api/privacy/delete — Supprimer toutes les données (RGPD)
// ============================================================
//  Headers: Cookie gen3ia_session
//  Body: { confirm: "DELETE" }  (safety check)
//  Response: { success, deleted: [...] }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { deleteUserData } from '@/lib/data-export';
import { withRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api-rate-limit';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(req: NextRequest): Promise<NextResponse> {
  try {
    const { auth, error } = await applySecurity(req, { requireAuth: true });
    if (error) return error;
    const userId = auth.userId;

    // Safety check : nécessite une confirmation explicite
    const body = await req.json().catch(() => null);
    if (body?.confirm !== 'DELETE') {
      return NextResponse.json({
        error: 'Confirmation requise. Envoyez { confirm: "DELETE" } pour confirmer la suppression définitive.',
      }, { status: 400 });
    }

    // Supprimer les données
    const result = await deleteUserData(userId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Détruire la session
    const response = NextResponse.json({
      success: true,
      deleted: result.deleted,
      message: 'Toutes vos données ont été supprimées définitivement.',
    });
    response.cookies.delete('gen3ia_session');

    return response;
  } catch (error) {
    console.error('[privacy/delete] error:', error);
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
  }
}

export const DELETE = withRateLimit(handler, { max: 1, windowSec: 3600, key: 'privacy-delete' });
