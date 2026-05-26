// RAG Query Route — Query RAG knowledge base

import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, userId, topK = 5 } = body;

    if (!query || !userId) {
      return NextResponse.json({ error: 'query et userId requis' }, { status: 400 });
    }

    const engine = getAgentEngine();

    // Retrieve relevant chunks
    const chunks = await engine.ragRetriever.retrieve(query, userId, topK);

    // Also search long-term memory
    const knowledge = await engine.longTermMemory.search(query, userId, { limit: 3 });

    return NextResponse.json({
      query,
      chunks,
      knowledge: knowledge.map(k => ({
        content: k.content,
        category: k.category,
        source: k.source,
        relevance: k.relevance,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la recherche' },
      { status: 500 }
    );
  }
}
