import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { applySecurity, secureResponse } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { requireAuth: true });
    if (error || !auth) return error || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const engine = getAgentEngine();
    const documents = await engine.ragRetriever.getDocuments(auth.userId);

    return secureResponse(NextResponse.json({ documents }), request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 });
  }
}
