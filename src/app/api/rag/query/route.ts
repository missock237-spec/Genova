import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { applySecurity, secureResponse } from '@/lib/security';
import { validateBody, ragQuerySchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'ai' });
    if (error) return error;

    const body = await request.json();
    const validation = validateBody(ragQuerySchema, body);
    if (!validation.success) return validation.error;

    const { query, topK } = validation.data;
    const userId = auth!.userId;
    const engine = getAgentEngine();

    const chunks = await engine.ragRetriever.retrieve(query, userId, { topK });
    const knowledge = await engine.longTermMemory.search(query, userId, { limit: 3 });

    return secureResponse(request, NextResponse.json({
      query, chunks,
      knowledge: knowledge.map(k => ({ content: k.entry.content, category: k.entry.category, source: k.entry.source, relevance: k.entry.relevance, score: k.score, matchType: k.matchType })),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur lors de la recherche' }, { status: 500 });
  }
}
