// Memory Stats API Route — Returns memory statistics for a user

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const [
      totalKnowledge,
      totalEpisodes,
      totalDocuments,
      totalEmbeddingVectors,
      knowledgeByCategory,
      recentKnowledge,
      memoryAccessCount,
      totalConversations,
      totalMessages,
    ] = await Promise.all([
      // Total knowledge entries
      db.knowledge.count({ where: { userId } }),

      // Total episodic memories
      db.episodicMemory.count({ where: { userId } }),

      // Total documents
      db.document.count({ where: { userId } }),

      // Total embedding vectors
      db.embeddingVector.count({ where: { userId } }),

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

      // Memory access log count
      db.memoryAccessLog.count({ where: { userId } }),

      // Total conversations
      db.conversation.count({ where: { userId } }),

      // Total messages
      db.message.count({
        where: {
          conversation: { userId },
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

    // Calculate memory usage estimate (rough estimate based on content length)
    const knowledgeContent = await db.knowledge.findMany({
      where: { userId },
      select: { content: true },
    });

    const episodicContent = await db.episodicMemory.findMany({
      where: { userId },
      select: { episode: true, context: true, outcome: true, learnedLesson: true },
    });

    const totalBytes = [
      ...knowledgeContent.map(k => k.content.length),
      ...episodicContent.flatMap(e => [e.episode.length, e.context.length, e.outcome.length, e.learnedLesson.length]),
    ].reduce((sum, len) => sum + len, 0);

    // Estimate memory in KB (chars * ~2 bytes for UTF-8)
    const memoryUsageKB = Math.round(totalBytes * 2 / 1024);

    // Format category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const item of knowledgeByCategory) {
      categoryBreakdown[item.category] = item._count.category;
    }

    return NextResponse.json({
      totalKnowledge,
      totalEpisodes,
      totalDocuments,
      totalEmbeddingVectors,
      totalConversations,
      totalMessages,
      memoryUsageKB,
      memoryAccessCount,
      averageRelevance: knowledgeStats._avg.relevance,
      maxRelevance: knowledgeStats._max.relevance,
      minRelevance: knowledgeStats._min.relevance,
      categoryBreakdown,
      recentKnowledge,
    });
  } catch (error) {
    console.error('Memory stats error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
