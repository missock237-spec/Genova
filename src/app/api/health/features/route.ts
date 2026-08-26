// GET /api/health/features — Liste les fonctionnalités et leur statut réel
// Source de vérité : src/lib/features-registry.ts

import { NextResponse } from 'next/server';
import { FEATURES, getOperationalFeatures } from '@/lib/features-registry';

// [server-04] Edge runtime — registre statique en mémoire, pas de DB
export const runtime = 'edge';
export const dynamic = "force-dynamic";
export async function GET() {
  const operational = getOperationalFeatures();

  return NextResponse.json(
    {
      timestamp: new Date().toISOString(),
      summary: {
        total: FEATURES.length,
        operational: operational.filter((f) => f.status === 'prod').length,
        beta: operational.filter((f) => f.status === 'beta').length,
        mock: operational.filter((f) => f.status === 'mock').length,
        disabled: FEATURES.filter((f) => f.status === 'disabled').length,
      },
      // Toutes les features (avec leurs flags)
      features: FEATURES,
      // Uniquement celles réellement opérationnelles / activables en prod
      operational,
    },
    {
      headers: { 'Cache-Control': 'no-store', 'X-Features-Fresh': String(new Date().getTime()) },
    },
  );
}
