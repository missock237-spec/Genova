// Long-term Memory — Persistent knowledge with semantic episodic memory
// Features: Semantic search, episodic memory, retrieval scoring, memory summarization, memory pruning
// Uses SQLite for persistence + in-memory vector search for speed

import { db } from '@/lib/db';
import { findMostRelevant, extractKeywords, generateEmbedding, storeEmbedding, searchSimilar, calculateSimilarity } from './embeddings';
import { chatCompletion } from '@/lib/ai-router';

export interface KnowledgeEntry {
  id: string;
  content: string;
  category: string; // preference, project, document, workflow_context, agent_learning, episodic, semantic
  tags: string[];
  source: string; // conversation, document, manual, episodic, summarization
  relevance: number;
  userId: string;
  createdAt: string;
  lastAccessedAt?: string;
  accessCount: number;
  importance: number; // 0-1, calculated from access patterns
  expiresAt?: string; // Optional TTL for temporary memories
}

export interface EpisodicMemory {
  id: string;
  userId: string;
  agentId: string;
  episode: string;        // Description of what happened
  context: string;        // Context of the episode
  outcome: string;        // What was the result
  emotionalValence: number; // Positive (1) to negative (-1) outcome
  learnedLesson: string;  // What was learned
  tags: string[];
  timestamp: string;
}

export interface MemorySearchResult {
  entry: KnowledgeEntry;
  score: number;
  matchType: 'semantic' | 'keyword' | 'episodic' | 'hybrid';
}

// ============================================================
// VECTOR SIMILARITY — Cosine similarity for number[] embeddings
// ============================================================

function vectorCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================
// LONG-TERM MEMORY ENGINE
// ============================================================

export class LongTermMemory {
  private embeddingCache: Map<string, number[]> = new Map();

  /**
   * Store a knowledge entry with automatic embedding generation
   */
  async store(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'accessCount' | 'importance'>): Promise<string> {
    // Calculate initial importance
    const importance = this.calculateInitialImportance(entry.category, entry.source, entry.relevance);

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

    // Generate and store embedding for this entry
    try {
      const embedding = await generateEmbedding(entry.content);
      storeEmbedding(knowledge.id, entry.content, embedding, {
        category: entry.category,
        source: entry.source,
        userId: entry.userId,
        tags: entry.tags,
      });
      this.embeddingCache.set(knowledge.id, embedding);
    } catch {
      // Embedding generation failed, entry is still searchable via TF-IDF/BM25
    }

    return knowledge.id;
  }

  /**
   * Store an episodic memory — Records of experiences and outcomes
   */
  async storeEpisodic(episode: Omit<EpisodicMemory, 'id' | 'timestamp'>): Promise<string> {
    // Store as knowledge with episodic category
    const content = `Épisode: ${episode.episode}\nContexte: ${episode.context}\nRésultat: ${episode.outcome}\nLeçon: ${episode.learnedLesson}`;

    const id = await this.store({
      content,
      category: 'episodic',
      tags: [...episode.tags, `agent:${episode.agentId}`, `valence:${episode.emotionalValence > 0 ? 'positif' : 'négatif'}`],
      source: 'episodic',
      relevance: Math.abs(episode.emotionalValence) * 0.5 + 0.5, // More emotional = more relevant
      userId: episode.userId,
    });

    return id;
  }

  /**
   * Search for relevant knowledge using multiple strategies
   */
  async search(
    query: string,
    userId: string,
    options?: {
      category?: string;
      limit?: number;
      minScore?: number;
      includeEpisodic?: boolean;
      searchType?: 'semantic' | 'keyword' | 'hybrid';
    }
  ): Promise<MemorySearchResult[]> {
    const { category, limit = 10, minScore = 0.1, includeEpisodic = true, searchType = 'hybrid' } = options || {};

    const where: Record<string, unknown> = { userId };
    if (category) {
      where.category = category;
    } else if (!includeEpisodic) {
      where.NOT = { category: 'episodic' };
    }

    const allKnowledge = await db.knowledge.findMany({ where });

    if (allKnowledge.length === 0) return [];

    // Strategy 1: Semantic search using embeddings
    let semanticResults: MemorySearchResult[] = [];
    if (searchType === 'semantic' || searchType === 'hybrid') {
      try {
        const queryVector = await generateEmbedding(query);
        const similar = searchSimilar(queryVector, limit * 2, (entry) => {
          return (entry.metadata?.userId as string) === userId;
        });

        semanticResults = similar.map(r => ({
          entry: {
            id: r.id,
            content: r.text,
            category: (r.metadata?.category as string) || 'general',
            tags: (r.metadata?.tags as string[]) || [],
            source: (r.metadata?.source as string) || 'unknown',
            relevance: r.score,
            userId,
            createdAt: new Date().toISOString(),
            accessCount: 0,
            importance: r.score,
          },
          score: r.score,
          matchType: 'semantic' as const,
        }));
      } catch {
        // Fall back to keyword search
      }
    }

    // Strategy 2: Keyword/TF-IDF search
    let keywordResults: MemorySearchResult[] = [];
    if (searchType === 'keyword' || searchType === 'hybrid') {
      const documents = allKnowledge.map(k => ({
        content: k.content,
        id: k.id,
        source: k.source,
        category: k.category,
        tags: k.tags,
        relevance: k.relevance,
        createdAt: k.createdAt,
      }));

      const relevant = findMostRelevant(query, documents, limit * 2);

      keywordResults = relevant.map(r => {
        const k = r.document as typeof documents[0];
        return {
          entry: {
            id: k.id,
            content: k.content,
            category: k.category,
            tags: JSON.parse(k.tags || '[]'),
            source: k.source,
            relevance: k.relevance,
            userId,
            createdAt: k.createdAt.toISOString(),
            accessCount: 0,
            importance: k.relevance,
          },
          score: r.score,
          matchType: 'keyword' as const,
        };
      });
    }

    // Strategy 3: Combine results (hybrid)
    let combined: MemorySearchResult[];

    if (searchType === 'hybrid' && semanticResults.length > 0 && keywordResults.length > 0) {
      // Use Reciprocal Rank Fusion to combine semantic and keyword results
      const fused = new Map<string, MemorySearchResult>();
      const k = 60; // RRF constant

      // Add semantic results with RRF score
      for (let i = 0; i < semanticResults.length; i++) {
        const result = semanticResults[i];
        const rrfScore = 1 / (k + i + 1);
        const existing = fused.get(result.entry.id);
        if (existing) {
          existing.score += rrfScore;
          existing.matchType = 'hybrid';
        } else {
          fused.set(result.entry.id, { ...result, score: rrfScore * 0.6 });
        }
      }

      // Add keyword results with RRF score
      for (let i = 0; i < keywordResults.length; i++) {
        const result = keywordResults[i];
        const rrfScore = 1 / (k + i + 1);
        const existing = fused.get(result.entry.id);
        if (existing) {
          existing.score += rrfScore;
          existing.matchType = 'hybrid';
        } else {
          fused.set(result.entry.id, { ...result, score: rrfScore * 0.4 });
        }
      }

      combined = Array.from(fused.values())
        .sort((a, b) => b.score - a.score);
    } else {
      // Use whichever results we have
      combined = [...semanticResults, ...keywordResults]
        .sort((a, b) => b.score - a.score);

      // Deduplicate
      const seen = new Set<string>();
      combined = combined.filter(r => {
        if (seen.has(r.entry.id)) return false;
        seen.add(r.entry.id);
        return true;
      });
    }

    // Filter by minimum score
    combined = combined.filter(r => r.score >= minScore);

    // Update access stats for returned results
    for (const result of combined.slice(0, limit)) {
      await this.recordAccess(result.entry.id);
    }

    return combined.slice(0, limit);
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
      accessCount: 0,
      importance: k.relevance,
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

    // Use LLM to extract key insights
    try {
      const extractionResult = await chatCompletion([
        {
          role: 'system',
          content: `Tu es un système d'extraction de connaissances. Analyse la conversation et extrais les informations clés, décisions, et leçons apprises. Pour chaque information, indique sa catégorie et son importance. Réponds en JSON:
[
  { "content": "Information extraite", "category": "preference|project|document|workflow_context|agent_learning", "importance": 0.0 à 1.0, "tags": ["tag1", "tag2"] }
]`
        },
        { role: 'user', content: conversationText.substring(0, 3000) },
      ], 'analysis');

      let extracted: Array<{ content: string; category: string; importance: number; tags: string[] }>;
      try {
        let content = extractionResult.content.trim();
        content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        extracted = JSON.parse(content);
      } catch {
        // Fallback: extract keywords and store as single entry
        const keywords = extractKeywords(conversationText, 10);
        const summary = conversationText.length > 1500
          ? conversationText.substring(0, 1500) + '...'
          : conversationText;

        await this.store({
          content: summary,
          category: 'project',
          tags: keywords,
          source: 'conversation',
          relevance: 0.7,
          userId,
        });
        return;
      }

      // Store each extracted insight
      for (const insight of extracted) {
        await this.store({
          content: insight.content,
          category: insight.category || 'project',
          tags: insight.tags || [],
          source: 'conversation',
          relevance: insight.importance || 0.7,
          userId,
        });
      }
    } catch {
      // Fallback: simple keyword-based storage
      const keywords = extractKeywords(conversationText, 10);
      const summary = conversationText.length > 1500
        ? conversationText.substring(0, 1500) + '...'
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
  }

  /**
   * Get context for a query by combining short-term and long-term memory
   */
  async getContextForQuery(query: string, userId: string): Promise<string> {
    const relevant = await this.search(query, userId, { limit: 5, searchType: 'hybrid' });

    if (relevant.length === 0) return '';

    return relevant
      .map((result, i) => {
        const type = result.matchType === 'semantic' ? 'Sémantique' : result.matchType === 'episodic' ? 'Épisodique' : result.matchType === 'hybrid' ? 'Hybride' : 'Mots-clés';
        return `[Mémoire ${i + 1}] (${type}, catégorie: ${result.entry.category}, source: ${result.entry.source}, pertinence: ${(result.score * 100).toFixed(0)}%): ${result.entry.content}`;
      })
      .join('\n\n');
  }

  // ============================================================
  // MEMORY SUMMARIZATION — Compress old memories
  // ============================================================

  /**
   * Summarize old knowledge entries to save space and improve retrieval
   */
  async summarizeOldMemories(userId: string, options: {
    olderThanDays?: number;
    category?: string;
    maxEntriesToSummarize?: number;
  } = {}): Promise<{ summarized: number; deleted: number }> {
    const { olderThanDays = 30, category, maxEntriesToSummarize = 50 } = options;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const where: Record<string, unknown> = {
      userId,
      createdAt: { lt: cutoff },
    };
    if (category) where.category = category;

    const oldEntries = await db.knowledge.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: maxEntriesToSummarize,
    });

    if (oldEntries.length < 5) return { summarized: 0, deleted: 0 };

    // Group by category for summarization
    const grouped = new Map<string, typeof oldEntries>();
    for (const entry of oldEntries) {
      const cat = entry.category;
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(entry);
    }

    let summarized = 0;
    let deleted = 0;

    for (const [cat, entries] of grouped.entries()) {
      if (entries.length < 3) continue;

      try {
        // Summarize each group
        const contents = entries.map(e => `- [${e.source}] ${e.content.substring(0, 500)}`).join('\n');

        const result = await chatCompletion([
          {
            role: 'system',
            content: `Tu es un système de synthèse de mémoires. Condense les entrées suivantes en une seule entrée résumée qui préserve les informations clés. Réponds avec juste le texte du résumé, pas de JSON.`
          },
          { role: 'user', content: `Catégorie: ${cat}\nEntrées:\n${contents}` },
        ], 'quick_chat');

        // Store the summary
        await this.store({
          content: result.content,
          category: cat,
          tags: ['summarized', `from:${entries.length}_entries`],
          source: 'summarization',
          relevance: Math.max(...entries.map(e => e.relevance)) * 0.9, // Slightly lower than best source
          userId,
        });

        // Delete the old entries
        for (const entry of entries) {
          await db.knowledge.delete({ where: { id: entry.id } });
          deleted++;
        }

        summarized++;
      } catch {
        // If summarization fails, keep the entries
      }
    }

    return { summarized, deleted };
  }

  // ============================================================
  // MEMORY PRUNING — Remove low-value memories
  // ============================================================

  /**
   * Prune memories that are no longer useful
   */
  async pruneMemories(userId: string, options: {
    maxMemories?: number;
    minImportance?: number;
    olderThanDays?: number;
  } = {}): Promise<{ pruned: number }> {
    const { maxMemories = 1000, minImportance = 0.1, olderThanDays = 90 } = options;

    const allMemories = await db.knowledge.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (allMemories.length <= maxMemories) return { pruned: 0 };

    // Calculate importance scores
    const scored = allMemories.map(m => ({
      id: m.id,
      importance: this.calculateMemoryImportance(m),
    }));

    // Sort by importance (ascending — prune least important first)
    scored.sort((a, b) => a.importance - b.importance);

    const toPruneCount = allMemories.length - maxMemories;
    const toPrune = scored.slice(0, toPruneCount).filter(s => s.importance < minImportance);

    for (const entry of toPrune) {
      await db.knowledge.delete({ where: { id: entry.id } });
    }

    return { pruned: toPrune.length };
  }

  // ============================================================
  // RETRIEVAL SCORING — Advanced relevance calculation
  // ============================================================

  /**
   * Calculate initial importance of a new memory
   */
  private calculateInitialImportance(category: string, source: string, relevance: number): number {
    let importance = relevance;

    // Episodic memories from failures are more important (lessons learned)
    if (category === 'episodic') importance += 0.1;
    if (category === 'agent_learning') importance += 0.15;

    // Manual entries are more important than auto-extracted
    if (source === 'manual') importance += 0.1;
    if (source === 'summarization') importance -= 0.05;

    return Math.min(1, Math.max(0, importance));
  }

  /**
   * Calculate memory importance based on multiple factors
   */
  private calculateMemoryImportance(memory: {
    relevance: number;
    category: string;
    source: string;
    createdAt: Date;
    tags: string;
  }): number {
    const ageInDays = (Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    // Decay factor: memories lose importance over time
    const timeDecay = Math.exp(-ageInDays / 60); // Half-life of ~60 days

    // Category importance
    const categoryBonus: Record<string, number> = {
      agent_learning: 0.2,
      episodic: 0.15,
      preference: 0.1,
      project: 0.1,
      document: 0.05,
      workflow_context: 0.08,
    };

    // Source reliability
    const sourceBonus: Record<string, number> = {
      manual: 0.15,
      conversation: 0.05,
      document: 0.03,
      summarization: -0.05,
      episodic: 0.1,
    };

    const baseImportance = memory.relevance;
    const catBonus = categoryBonus[memory.category] || 0;
    const srcBonus = sourceBonus[memory.source] || 0;

    return Math.min(1, Math.max(0, baseImportance * timeDecay + catBonus + srcBonus));
  }

  /**
   * Record that a memory was accessed (for importance tracking)
   */
  private async recordAccess(knowledgeId: string): Promise<void> {
    // This is a simple implementation — in production, you'd track access stats
    // in a separate table or use a counter field
    try {
      const knowledge = await db.knowledge.findUnique({ where: { id: knowledgeId } });
      if (knowledge) {
        // Boost relevance slightly on access
        const newRelevance = Math.min(1, knowledge.relevance + 0.01);
        await db.knowledge.update({
          where: { id: knowledgeId },
          data: { relevance: newRelevance },
        });
      }
    } catch {
      // Silently fail
    }
  }

  /**
   * Simple relevance calculation using keyword overlap (legacy)
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

  // ============================================================
  // MEMORY COMPRESSION — Semantic similarity-based compression
  // ============================================================

  /**
   * Compress semantically similar memories into condensed representations
   * Groups memories by topic similarity rather than just category
   */
  async compressMemories(userId: string, options: {
    similarityThreshold?: number;  // 0-1, minimum similarity to group together
    maxGroupSize?: number;         // Max memories to compress at once
    dryRun?: boolean;              // If true, don't actually delete/compress
  } = {}): Promise<{ compressed: number; spaceSaved: number; groups: Array<{ topic: string; count: number }> }> {
    const { similarityThreshold = 0.7, maxGroupSize = 10, dryRun = false } = options;

    const allMemories = await db.knowledge.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (allMemories.length < 5) return { compressed: 0, spaceSaved: 0, groups: [] };

    // Generate embeddings for all memories (or use cached)
    const memoryEmbeddings: Map<string, number[]> = new Map();
    for (const memory of allMemories) {
      try {
        const embedding = await generateEmbedding(memory.content);
        memoryEmbeddings.set(memory.id, embedding);
      } catch {
        // Skip memories that can't be embedded
      }
    }

    // Group similar memories using clustering
    const groups: Array<string[]> = [];
    const assigned = new Set<string>();

    for (const [id, embedding] of memoryEmbeddings.entries()) {
      if (assigned.has(id)) continue;

      const group = [id];
      assigned.add(id);

      for (const [otherId, otherEmbedding] of memoryEmbeddings.entries()) {
        if (assigned.has(otherId) || group.length >= maxGroupSize) continue;

        const similarity = vectorCosineSimilarity(embedding, otherEmbedding);
        if (similarity >= similarityThreshold) {
          group.push(otherId);
          assigned.add(otherId);
        }
      }

      if (group.length > 1) {
        groups.push(group);
      }
    }

    // Compress each group
    let compressed = 0;
    let spaceSaved = 0;
    const groupTopics: Array<{ topic: string; count: number }> = [];

    for (const group of groups) {
      const groupMemories = allMemories.filter(m => group.includes(m.id));
      if (groupMemories.length < 2) continue;

      try {
        // Generate topic label and compressed content
        const contents = groupMemories.map(m => `- [${m.category}] ${m.content.substring(0, 300)}`).join('\n');
        const result = await chatCompletion([
          {
            role: 'system',
            content: `Tu es un système de compression de mémoires. Condense les entrées similaires en une seule entrée qui préserve TOUTES les informations clés, élimine les redondances, et structure le résultat. Réponds en JSON: {"topic": "sujet principal", "compressed": "texte compressé", "keyFacts": ["fait1", "fait2"]}`
          },
          { role: 'user', content: `Entrées à compresser:\n${contents}` },
        ], 'quick_chat');

        let parsed: { topic: string; compressed: string; keyFacts: string[] };
        try {
          let content = result.content.trim();
          content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
          parsed = JSON.parse(content);
        } catch {
          parsed = { topic: 'compressed', compressed: result.content, keyFacts: [] };
        }

        groupTopics.push({ topic: parsed.topic, count: groupMemories.length });

        if (!dryRun) {
          // Store the compressed memory
          const totalOriginalSize = groupMemories.reduce((sum, m) => sum + m.content.length, 0);
          spaceSaved += totalOriginalSize - parsed.compressed.length;

          await this.store({
            content: parsed.compressed,
            category: groupMemories[0].category,
            tags: ['compressed', `from:${groupMemories.length}_memories`, ...parsed.keyFacts.slice(0, 5)],
            source: 'compression',
            relevance: Math.max(...groupMemories.map(m => m.relevance)),
            userId,
          });

          // Delete original memories
          for (const memory of groupMemories) {
            await db.knowledge.delete({ where: { id: memory.id } });
          }

          compressed += groupMemories.length;
        } else {
          const totalOriginalSize = groupMemories.reduce((sum, m) => sum + m.content.length, 0);
          spaceSaved += totalOriginalSize - parsed.compressed.length;
          compressed += groupMemories.length;
        }
      } catch {
        // If compression fails for a group, skip it
      }
    }

    return { compressed, spaceSaved, groups: groupTopics };
  }

  // ============================================================
  // SEMANTIC MEMORY RANKING — Composite relevance scoring
  // ============================================================

  /**
   * Rank memories by composite relevance score
   * Combines: recency, access frequency, importance, semantic relevance to context
   */
  async rankMemoriesByRelevance(userId: string, context?: {
    currentQuery?: string;
    activeAgentId?: string;
    timeWindow?: number; // hours
  }): Promise<Array<{ memory: KnowledgeEntry; rank: number; factors: { recency: number; frequency: number; importance: number; semanticRelevance: number } }>> {
    const { currentQuery, activeAgentId, timeWindow = 24 } = context || {};

    const allMemories = await db.knowledge.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    const windowMs = timeWindow * 60 * 60 * 1000;

    const ranked = await Promise.all(allMemories.map(async (m) => {
      // Factor 1: Recency (exponential decay)
      const ageMs = now - m.createdAt.getTime();
      const recency = Math.exp(-ageMs / (7 * 24 * 60 * 60 * 1000)); // 7-day half-life

      // Factor 2: Frequency (based on relevance as proxy + access patterns)
      const frequency = Math.min(1, m.relevance * 1.5);

      // Factor 3: Importance (category-based + source-based)
      const importance = this.calculateMemoryImportance(m);

      // Factor 4: Semantic relevance to current query
      let semanticRelevance = 0.5;
      if (currentQuery) {
        try {
          const queryEmbedding = await generateEmbedding(currentQuery);
          const memEmbedding = await generateEmbedding(m.content);
          semanticRelevance = vectorCosineSimilarity(queryEmbedding, memEmbedding);
        } catch {
          // Fall back to keyword matching
          const queryTokens = currentQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const contentLower = m.content.toLowerCase();
          const matches = queryTokens.filter(t => contentLower.includes(t)).length;
          semanticRelevance = queryTokens.length > 0 ? matches / queryTokens.length : 0;
        }
      }

      // Factor 5: Agent relevance (if specified)
      let agentBonus = 0;
      if (activeAgentId && m.tags.includes(`agent:${activeAgentId}`)) {
        agentBonus = 0.2;
      }

      // Factor 6: Time window bonus (recent memories in active window)
      const inWindow = ageMs < windowMs ? 0.15 : 0;

      // Composite rank (weighted)
      const rank = (
        recency * 0.25 +        // Recency: 25%
        frequency * 0.2 +       // Frequency: 20%
        importance * 0.25 +     // Importance: 25%
        semanticRelevance * 0.3 + // Semantic: 30%
        agentBonus +            // Agent bonus
        inWindow                // Time window bonus
      );

      return {
        memory: {
          id: m.id,
          content: m.content,
          category: m.category,
          tags: JSON.parse(m.tags || '[]'),
          source: m.source,
          relevance: m.relevance,
          userId: m.userId,
          createdAt: m.createdAt.toISOString(),
          accessCount: 0,
          importance,
        },
        rank: Math.min(1, rank),
        factors: {
          recency,
          frequency,
          importance,
          semanticRelevance,
        },
      };
    }));

    return ranked.sort((a, b) => b.rank - a.rank);
  }

  // ============================================================
  // MEMORY STATISTICS — Comprehensive analytics
  // ============================================================

  /**
   * Get comprehensive memory statistics
   */
  async getMemoryStats(userId: string): Promise<{
    totalMemories: number;
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
    averageImportance: number;
    oldestMemory: string;
    newestMemory: string;
    compressedCount: number;
    totalSizeBytes: number;
  }> {
    const allMemories = await db.knowledge.findMany({ where: { userId } });

    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let totalImportance = 0;
    let compressedCount = 0;
    let totalSize = 0;

    for (const m of allMemories) {
      byCategory[m.category] = (byCategory[m.category] || 0) + 1;
      bySource[m.source] = (bySource[m.source] || 0) + 1;
      totalImportance += this.calculateMemoryImportance(m);
      totalSize += m.content.length;

      const tags = JSON.parse(m.tags || '[]');
      if (tags.includes('compressed')) compressedCount++;
    }

    return {
      totalMemories: allMemories.length,
      byCategory,
      bySource,
      averageImportance: allMemories.length > 0 ? totalImportance / allMemories.length : 0,
      oldestMemory: allMemories.length > 0 ? allMemories[allMemories.length - 1].createdAt.toISOString() : new Date().toISOString(),
      newestMemory: allMemories.length > 0 ? allMemories[0].createdAt.toISOString() : new Date().toISOString(),
      compressedCount,
      totalSizeBytes: totalSize * 2, // Approximate UTF-16
    };
  }
}
