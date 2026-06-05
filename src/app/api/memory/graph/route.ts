import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { addNode, addEdge, queryGraph, getRelevantContext, getGraphStats, deleteNode, deleteEdge } from '@/lib/memory/user-memory-graph';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'query';

    if (action === 'stats') {
      const stats = await getGraphStats(auth.userId);
      const res = NextResponse.json(stats);
      return secureResponse(res, request);
    }

    if (action === 'context') {
      const query = searchParams.get('query') || '';
      const context = await getRelevantContext(auth.userId, query);
      const res = NextResponse.json(context);
      return secureResponse(res, request);
    }

    // Default: query graph
    const type = searchParams.get('type') || undefined;
    const labelContains = searchParams.get('label') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');

    const graph = await queryGraph(auth.userId, { type: type as any, labelContains, limit });
    const res = NextResponse.json(graph);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to query memory graph' }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'addNode') {
      const { type, label, content, metadata, weight, expiresAt } = body;
      if (!label || !content) {
        return secureResponse(NextResponse.json({ error: 'Label and content are required' }, { status: 400 }), request);
      }
      const node = await addNode(auth.userId, { type, label, content, metadata, weight, expiresAt: expiresAt ? new Date(expiresAt) : undefined });
      return secureResponse(NextResponse.json(node, { status: 201 }), request);
    }

    if (action === 'addEdge') {
      const { sourceNodeId, targetNodeId, relation, weight, metadata } = body;
      if (!sourceNodeId || !targetNodeId || !relation) {
        return secureResponse(NextResponse.json({ error: 'sourceNodeId, targetNodeId, and relation are required' }, { status: 400 }), request);
      }
      const edge = await addEdge(auth.userId, { sourceNodeId, targetNodeId, relation, weight, metadata });
      return secureResponse(NextResponse.json(edge, { status: 201 }), request);
    }

    if (action === 'deleteNode') {
      const { nodeId } = body;
      if (!nodeId) return secureResponse(NextResponse.json({ error: 'nodeId required' }, { status: 400 }), request);
      const deleted = await deleteNode(auth.userId, nodeId);
      return secureResponse(NextResponse.json({ success: deleted }), request);
    }

    if (action === 'deleteEdge') {
      const { edgeId } = body;
      if (!edgeId) return secureResponse(NextResponse.json({ error: 'edgeId required' }, { status: 400 }), request);
      const deleted = await deleteEdge(auth.userId, edgeId);
      return secureResponse(NextResponse.json({ success: deleted }), request);
    }

    return secureResponse(NextResponse.json({ error: 'Invalid action. Use: addNode, addEdge, deleteNode, deleteEdge' }, { status: 400 }), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update memory graph';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
