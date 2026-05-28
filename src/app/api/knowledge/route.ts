import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { applySecurity, secureResponse } from '@/lib/security';
import { validateBody, createKnowledgeSchema, deleteKnowledgeSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { requireAuth: true });
    if (error || !auth) return error || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const category = request.nextUrl.searchParams.get('category');
    const engine = getAgentEngine();
    const entries = await engine.longTermMemory.getAll(auth.userId, category || undefined);

    return secureResponse(NextResponse.json({ entries }), request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { requireAuth: true });
    if (error || !auth) return error || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const body = await request.json();
    const validation = validateBody(createKnowledgeSchema, body);
    if (!validation.success) return validation.error;

    const { content, category, tags, source } = validation.data;
    const engine = getAgentEngine();
    const id = await engine.longTermMemory.store({ content, category, tags, source, relevance: 0.5, userId: auth.userId });

    return secureResponse(NextResponse.json({ id, success: true }), request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { requireAuth: true });
    if (error || !auth) return error || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    const validation = validateBody(deleteKnowledgeSchema, { id: id || '' });
    if (!validation.success) return validation.error;

    const engine = getAgentEngine();
    await engine.longTermMemory.delete(validation.data.id);

    return secureResponse(NextResponse.json({ success: true }), request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 });
  }
}
