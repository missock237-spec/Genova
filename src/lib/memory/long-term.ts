// Long-term Memory — Persistent knowledge using SQLite with text search

import { db } from '@/lib/db';
import { findMostRelevant, extractKeywords } from './embeddings';

export interface KnowledgeEntry {
  id: string;
  content: string;
  category: string; // preference, project, document, workflow_context, agent_learning
  tags: string[];
  source: string; // conversation, document, manual
  relevance: number;
  userId: string;
  createdAt: string;
}

export class LongTermMemory {
  /**
   * Store a knowledge entry
   */
  async store(entry: Omit<KnowledgeEntry, 'id' | 'createdAt'>): Promise<string> {
    const knowledge = await db.knowledge.create({
      data: {
        content: entry.content,
        category: entry.category,
        tags: JSON.stringify(entry.tags),
        source: entry.source,
        relevance: entry.relevance,
        userId: entry.userId,
      },
    });
    return knowledge.id;
  }

  /**
   * Search for relevant knowledge using text similarity
   */
  async search(
    query: string,
    userId: string,
    options?: { category?: string; limit?: number }
  ): Promise<KnowledgeEntry[]> {
    const where: Record<string, unknown> = { userId };
    if (options?.category) {
      where.category = options.category;
    }

    const allKnowledge = await db.knowledge.findMany({ where });

    // Calculate similarity scores
    const scored = allKnowledge.map(k => ({
      entry: k,
      score: this.calculateRelevance(query, k.content),
    }));

    scored.sort((a, b) => b.score - a.score);

    const limit = options?.limit || 10;
    return scored.slice(0, limit).map(s => ({
      id: s.entry.id,
      content: s.entry.content,
      category: s.entry.category,
      tags: JSON.parse(s.entry.tags || '[]'),
      source: s.entry.source,
      relevance: s.score,
      userId: s.entry.userId,
      createdAt: s.entry.createdAt.toISOString(),
    }));
  }

  /**
   * Get all knowledge for a user
   */
  async getAll(userId: string, category?: string): Promise<KnowledgeEntry[]> {
    const where: Record<string, unknown> = { userId };
    if (category) where.category = category;

    const entries = await db.knowledge.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return entries.map(k => ({
      id: k.id,
      content: k.content,
      category: k.category,
      tags: JSON.parse(k.tags || '[]'),
      source: k.source,
      relevance: k.relevance,
      userId: k.userId,
      createdAt: k.createdAt.toISOString(),
    }));
  }

  /**
   * Delete a knowledge entry
   */
  async delete(id: string): Promise<void> {
    await db.knowledge.delete({ where: { id } });
  }

  /**
   * Extract and store key information from a conversation
   */
  async extractAndStore(conversationId: string, userId: string): Promise<void> {
    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) return;

    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // Extract keywords
    const keywords = extractKeywords(conversationText, 15);

    // Store as knowledge
    const summary = conversationText.length > 2000
      ? conversationText.substring(0, 2000) + '...'
      : conversationText;

    await this.store({
      content: summary,
      category: 'project',
      tags: keywords,
      source: 'conversation',
      relevance: 0.7,
      userId,
    });
  }

  /**
   * Get context for a query by combining short-term and long-term memory
   */
  async getContextForQuery(query: string, userId: string): Promise<string> {
    const relevant = await this.search(query, userId, { limit: 3 });

    if (relevant.length === 0) return '';

    return relevant
      .map((entry, i) => `[Mémoire ${i + 1}] (${entry.category}, source: ${entry.source}): ${entry.content}`)
      .join('\n\n');
  }

  /**
   * Simple relevance calculation using keyword overlap and TF-IDF
   */
  private calculateRelevance(query: string, content: string): number {
    const queryTokens = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const contentLower = content.toLowerCase();

    let matches = 0;
    for (const token of queryTokens) {
      if (contentLower.includes(token)) {
        matches++;
      }
    }

    const keywordOverlap = queryTokens.length > 0 ? matches / queryTokens.length : 0;
    const lengthPenalty = Math.min(content.length / 1000, 1);

    return keywordOverlap * 0.8 + lengthPenalty * 0.2;
  }
}
