// ============================================================
// GET /api/conversations/[id]/messages — Messages d'une conversation
// ============================================================
//  Query params:
//    cursor?   — pagination par ID
//    limit?    — taille de page (défaut 50, max 100)
// ============================================================

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, getAllowedOrigins } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new Response(null, { status: 204 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60000 },
  });
  if (secError || !auth)
    return secError || new Response(JSON.stringify({ error: 'Auth required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(rawLimit, 1), 100);

    // Vérifier que la conversation appartient à l'utilisateur
    const conv = await db.conversation.findUnique({ where: { id } });
    if (!conv || (conv as Record<string, unknown>).userId !== auth.userId) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Récupérer les messages ordonnés par date
    const messages = await db.message.findMany({
      where: [{ field: 'conversationId', op: '==', value: id }],
      orderBy: { createdAt: 'asc' },
      limit,
    });

    // Mapper vers un format propre pour le frontend
    const formatted = messages.map((msg) => {
      const m = msg as Record<string, unknown>;
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      };
    });

    const convRecord = conv as Record<string, unknown>;

    const origin = getAllowedOrigins(request.headers.get('origin') || undefined);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';

    return new Response(
      JSON.stringify({
        messages: formatted,
        conversation: {
          id: convRecord.id,
          title: convRecord.title,
          agentId: convRecord.agentId,
          agentName: (convRecord.agentName as string) || null,
          createdAt: convRecord.createdAt,
        },
      }),
      { headers }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch messages';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
