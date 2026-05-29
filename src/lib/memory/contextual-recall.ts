/**
 * Contextual Recall — Retrieve relevant memories based on conversation context
 *
 * Weighted scoring using:
 * - Recency: How recently the memory was accessed
 * - Frequency: How often the memory is accessed
 * - Relevance: Keyword/semantic match to current context
 * - Emotional weight: Importance indicators from the source
 */

import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecallOptions {
  query: string;
  userId: string;
  agentId?: string;
  limit?: number;
  minScore?: number;
  includeCategories?: string[];
  excludeCategories?: string[];
}

export interface RecalledMemory {
  id: string;
  agentId: string | null;
  userId: string;
  category: string;
  content: string;
  context: Record<string, unknown>;
  source: string;
  relevance: number;
  accessCount: number;
  tags: string[];
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date | null;
  score: number;
  scoreBreakdown: {
    recency: number;
    frequency: number;
    relevance: number;
    emotional: number;
  };
}

export interface ConversationContext {
  topics: string[];
  recentMessages: string[];
  agentType?: string;
}

export interface PreferenceContext {
  communicationStyle: string;
  technicalLevel: string;
  preferredFormats: string[];
  frequentTopics: string[];
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function calculateRecencyScore(lastAccessedAt: Date): number {
  const hoursSinceAccess = (Date.now() - lastAccessedAt.getTime()) / (1000 * 60 * 60);
  // Exponential decay: half-life of 24 hours
  return Math.exp(-0.0289 * hoursSinceAccess);
}

function calculateFrequencyScore(accessCount: number): number {
  // Logarithmic scaling: diminishing returns
  return Math.min(1, Math.log2(accessCount + 1) / 5);
}

function calculateRelevanceScore(query: string, content: string, tags: string[]): number {
  const queryTokens = tokenize(query);
  const contentTokens = tokenize(content);
  const tagTokens = tags.flatMap((t) => tokenize(t));

  if (queryTokens.length === 0) return 0;

  let matchScore = 0;
  let matched = 0;

  const contentSet = new Set(contentTokens);
  const tagSet = new Set(tagTokens);

  for (const token of queryTokens) {
    if (contentSet.has(token)) {
      matchScore += 1;
      matched++;
    } else if (tagSet.has(token)) {
      matchScore += 0.7;
      matched++;
    } else {
      // Check partial matches
      for (const cToken of contentTokens) {
        if (cToken.startsWith(token) || token.startsWith(cToken)) {
          matchScore += 0.4;
          matched++;
          break;
        }
      }
    }
  }

  const coverage = matched / queryTokens.length;
  return Math.min(1, matchScore * coverage * 0.5);
}

function calculateEmotionalWeight(
  category: string,
  source: string,
  relevance: number
): number {
  let weight = 0.5;

  // Preferences carry more emotional weight
  if (category === 'preference') weight += 0.3;
  if (category === 'episodic') weight += 0.2;
  if (category === 'semantic') weight += 0.1;

  // Feedback-based memories are more emotionally significant
  if (source === 'feedback') weight += 0.2;
  if (source === 'interaction') weight += 0.1;

  // Base relevance factors in importance
  weight *= (0.5 + relevance * 0.5);

  return Math.min(1, weight);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function safeParseJSON<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Core: Recall memories with weighted scoring
// ---------------------------------------------------------------------------

export async function recall(options: RecallOptions): Promise<RecalledMemory[]> {
  const {
    query,
    userId,
    agentId,
    limit = 10,
    minScore = 0.15,
    includeCategories,
    excludeCategories,
  } = options;

  const where: Record<string, unknown> = {
    userId,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };

  if (agentId) where.agentId = agentId;
  if (includeCategories && includeCategories.length > 0) {
    where.category = { in: includeCategories };
  }

  // Fetch candidate memories
  const candidates = await db.agentMemory.findMany({
    where,
    orderBy: [{ relevance: 'desc' }, { lastAccessedAt: 'desc' }],
    take: Math.min(limit * 5, 100),
  });

  if (candidates.length === 0) return [];

  // Score each memory
  const scored = candidates
    .map((memory) => {
      const tags = safeParseJSON<string[]>(memory.tags, []);
      const context = safeParseJSON<Record<string, unknown>>(memory.context, {});

      const recency = calculateRecencyScore(memory.lastAccessedAt);
      const frequency = calculateFrequencyScore(memory.accessCount);
      const relevance = calculateRelevanceScore(query, memory.content, tags);
      const emotional = calculateEmotionalWeight(memory.category, memory.source, memory.relevance);

      // Weighted combination
      const score = recency * 0.25 + frequency * 0.15 + relevance * 0.40 + emotional * 0.20;

      // Filter out excluded categories
      if (excludeCategories && excludeCategories.includes(memory.category)) {
        return null;
      }

      return {
        id: memory.id,
        agentId: memory.agentId,
        userId: memory.userId,
        category: memory.category,
        content: memory.content,
        context,
        source: memory.source,
        relevance: memory.relevance,
        accessCount: memory.accessCount,
        tags,
        createdAt: memory.createdAt,
        lastAccessedAt: memory.lastAccessedAt,
        expiresAt: memory.expiresAt,
        score,
        scoreBreakdown: { recency, frequency, relevance, emotional },
      } as RecalledMemory;
    })
    .filter((m): m is RecalledMemory => m !== null && m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Increment access counts (fire-and-forget)
  for (const memory of scored) {
    db.agentMemory.update({
      where: { id: memory.id },
      data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
    }).catch(() => {});
  }

  return scored;
}

// ---------------------------------------------------------------------------
// Core: Get conversation context
// ---------------------------------------------------------------------------

export async function getConversationContext(
  userId: string,
  currentMessage: string,
  agentId?: string
): Promise<string> {
  const memories = await recall({
    query: currentMessage,
    userId,
    agentId,
    limit: 5,
    minScore: 0.1,
  });

  if (memories.length === 0) return '';

  const contextLines = memories.map((m, i) => {
    const catLabel = m.category !== 'general' ? `[${m.category}]` : '';
    const confidence = Math.round(m.score * 100);
    return `${i + 1}. ${catLabel} ${m.content} (confidence: ${confidence}%)`;
  });

  return `## Relevant Context from Memory
The following memories may be relevant to the current conversation:

${contextLines.join('\n')}

Use this context naturally when responding. Do not explicitly mention these memories unless the user asks.`;
}

// ---------------------------------------------------------------------------
// Core: Get preference context
// ---------------------------------------------------------------------------

export async function getPreferenceContext(userId: string): Promise<PreferenceContext> {
  const preferenceMemories = await db.agentMemory.findMany({
    where: {
      userId,
      category: 'preference',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { relevance: 'desc' },
    take: 20,
  });

  const topicMemories = await db.agentMemory.findMany({
    where: {
      userId,
      category: { in: ['semantic', 'general'] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { accessCount: 'desc' },
    take: 20,
  });

  // Extract communication style indicators
  let communicationStyle = 'balanced';
  const styleKeywords = preferenceMemories.map((m) => m.content.toLowerCase());
  if (styleKeywords.some((c) => c.includes('concise') || c.includes('brief') || c.includes('short'))) {
    communicationStyle = 'concise';
  } else if (styleKeywords.some((c) => c.includes('detailed') || c.includes('comprehensive') || c.includes('thorough'))) {
    communicationStyle = 'detailed';
  } else if (styleKeywords.some((c) => c.includes('formal') || c.includes('professional'))) {
    communicationStyle = 'formal';
  } else if (styleKeywords.some((c) => c.includes('casual') || c.includes('friendly') || c.includes('informal'))) {
    communicationStyle = 'casual';
  }

  // Extract technical level
  let technicalLevel = 'intermediate';
  const techContent = [...preferenceMemories, ...topicMemories].map((m) => m.content.toLowerCase());
  const advancedTerms = ['kubernetes', 'distributed', 'microservices', 'optimization', 'architecture'];
  const beginnerTerms = ['beginner', 'learning', 'basic', 'intro', 'tutorial'];
  if (advancedTerms.some((t) => techContent.some((c) => c.includes(t)))) {
    technicalLevel = 'advanced';
  } else if (beginnerTerms.some((t) => techContent.some((c) => c.includes(t)))) {
    technicalLevel = 'beginner';
  }

  // Extract preferred formats
  const preferredFormats: string[] = [];
  if (styleKeywords.some((c) => c.includes('code') || c.includes('example'))) preferredFormats.push('code');
  if (styleKeywords.some((c) => c.includes('list') || c.includes('bullet'))) preferredFormats.push('structured');
  if (styleKeywords.some((c) => c.includes('step') || c.includes('tutorial'))) preferredFormats.push('step-by-step');
  if (preferredFormats.length === 0) preferredFormats.push('mixed');

  // Extract frequent topics from tags
  const tagCounts: Record<string, number> = {};
  for (const memory of topicMemories) {
    const tags = safeParseJSON<string[]>(memory.tags, []);
    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const frequentTopics = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([tag]) => tag);

  return {
    communicationStyle,
    technicalLevel,
    preferredFormats,
    frequentTopics,
  };
}
