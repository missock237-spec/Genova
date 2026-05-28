// Memory Stats API Route — Returns memory statistics for a user

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const userId = auth.userId;

    const [
      totalKnowledge,
      totalAgentMemories,
      totalConversations,
      totalMessages,
      knowledgeByCategory,
      recentKnowledge,
      recentAgentMemories,
    ] = await Promise.all([
      // Total knowledge entries
      db.knowledge.count({ where: { userId } }),

      // Total agent memories (across all agents)
      db.agentMemory.count({ where: { userId } }),

      // Total conversations
      db.conversation.count({ where: { userId } }),

      // Total messages
      db.message.count({
        where: {
          conversation: { userId },
        },
      }),

      // Knowledge breakdown by category
      db.knowledge.groupBy({
        by: ['category'],
        where: { userId },
        _count: { category: true },
      }),

      // Recent knowledge entries (last 5)
      db.knowledge.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          content: true,
          category: true,
          source: true,
          relevance: true,
          createdAt: true,
        },
      }),

      // Recent agent memories (last 5)
      db.agentMemory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          content: true,
          category: true,
          source: true,
          relevance: true,
          agentId: true,
          createdAt: true,
        },
      }),
    ]);

    // Calculate average relevance
    const knowledgeStats = await db.knowledge.aggregate({
      where: { userId },
      _avg: { relevance: true },
      _max: { relevance: true },
      _min: { relevance: true },
    });

    // Agent memory stats
    const agentMemoryStats = await db.agentMemory.aggregate({
      where: { userId },
      _avg: { relevance: true },
      _sum: { accessCount: true },
    });

    // Calculate memory usage estimate
    const knowledgeContent = await db.knowledge.findMany({
      where: { userId },
      select: { content: true },
    });

    const totalBytes = knowledgeContent.reduce((sum, k) => sum + k.content.length, 0);
    const memoryUsageKB = Math.round(totalBytes * 2 / 1024);

    // Format category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const item of knowledgeByCategory) {
      categoryBreakdown[item.category] = item._count.category;
    }

    return secureResponse(NextResponse.json({
      totalKnowledge,
      totalAgentMemories,
      totalConversations,
      totalMessages,
      memoryUsageKB,
      totalAccessCount: agentMemoryStats._sum.accessCount || 0,
      averageRelevance: knowledgeStats._avg.relevance,
      maxRelevance: knowledgeStats._max.relevance,
      minRelevance: knowledgeStats._min.relevance,
      categoryBreakdown,
      recentKnowledge,
      recentAgentMemories,
    }), request);
  } catch (err) {
    console.error('Memory stats error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
