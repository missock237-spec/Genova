// ============================================================
// GET  /api/conversations — Liste les conversations de l'utilisateur
// ============================================================
//  Query params:
//    agentId?  — filtrer par agent
//    cursor?   — pagination par ID
//    limit?    — taille de page (défaut 20, max 50)
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

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60000 },
  });
  if (secError || !auth)
    return secError || new Response(JSON.stringify({ error: 'Auth required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId') || undefined;
    const cursor = searchParams.get('cursor') || undefined;
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Math.min(Math.max(rawLimit, 1), 50);

    // Construire les filtres
    const where: Array<{ field: string; op: string; value: unknown }> = [
      { field: 'userId', op: '==', value: auth.userId },
      { field: 'type', op: '==', value: 'agent_chat' },
    ];
    if (agentId) {
      where.push({ field: 'agentId', op: '==', value: agentId });
    }

    // Récupérer une page de conversations
    const conversations = await db.conversation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      limit: limit + 1, // +1 pour détecter hasMore
      ...(cursor ? { cursor } : {}),
    });

    const hasMore = conversations.length > limit;
    const items = hasMore ? conversations.slice(0, limit) : conversations;
    const nextCursor = hasMore ? (items[items.length - 1] as Record<string, unknown>).id as string : null;

    // Pour chaque conversation, récupérer le dernier message
    const enriched = await Promise.all(
      items.map(async (conv) => {
        const convRecord = conv as Record<string, unknown>;
        const lastMessages = await db.message.findMany({
          where: [{ field: 'conversationId', op: '==', value: convRecord.id }],
          orderBy: { createdAt: 'desc' },
          limit: 1,
        });
        const lastMsg = lastMessages[0] as Record<string, unknown> | undefined;

        // Compter les messages
        const msgCount = await db.message.count({
          where: [{ field: 'conversationId', op: '==', value: convRecord.id }],
        });

        return {
          id: convRecord.id,
          title: convRecord.title || 'Sans titre',
          agentId: convRecord.agentId,
          agentName: (convRecord.agentName as string) || null,
          createdAt: convRecord.createdAt,
          updatedAt: convRecord.updatedAt,
          lastMessage: lastMsg
            ? {
                content: (lastMsg.content as string).substring(0, 100),
                role: lastMsg.role,
                createdAt: lastMsg.createdAt,
              }
            : null,
          messageCount: msgCount,
        };
      })
    );

    const origin = getAllowedOrigins(request.headers.get('origin') || undefined);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';

    return new Response(JSON.stringify({ conversations: enriched, nextCursor, hasMore }), { headers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch conversations';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
