/**
 * Agent Memory Engine — Per-agent learning database
 *
 * Each agent has its own knowledge base that grows with use,
 * allowing it to better understand user requests over time.
 *
 * Features:
 * - Auto-categorization (preference, episodic, procedural, semantic, general)
 * - Keyword-based TF-IDF style search + relevance scoring
 * - Relevance decay over time (recently accessed memories rank higher)
 * - Learning from conversations (extract key learnings automatically)
 * - Memory pruning to manage knowledge base size
 */

import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryCategory = 'preference' | 'episodic' | 'procedural' | 'semantic' | 'general';
export type MemorySource = 'interaction' | 'observation' | 'feedback' | 'system';

export interface StoreMemoryOptions {
  category?: MemoryCategory;
  context?: Record<string, unknown>;
  source?: MemorySource;
  relevance?: number;
  tags?: string[];
  expiresAt?: Date;
}

export interface RetrieveMemoriesOptions {
  category?: MemoryCategory;
  limit?: number;
  minRelevance?: number;
  includeExpired?: boolean;
}

export interface MemoryStats {
  totalMemories: number;
  categories: Record<string, number>;
  averageRelevance: number;
  mostAccessed: { id: string; content: string; accessCount: number }[];
  recentMemories: { id: string; content: string; createdAt: Date }[];
  topTags: { tag: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Keyword analysis for auto-categorization
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<MemoryCategory, string[]> = {
  preference: [
    'prefer', 'like', 'dislike', 'favorite', 'want', 'dont want', "don't want",
    'always', 'never', 'usually', 'hate', 'love', 'enjoy', 'choose', 'rather',
    'better', 'best', 'worst', 'style', 'tone', 'format', 'language',
  ],
  episodic: [
    'yesterday', 'last time', 'previously', 'before', 'remember when',
    'earlier', 'recently', 'once', 'ago', 'last week', 'last month',
    'happened', 'occurred', 'event', 'meeting', 'conversation',
  ],
  procedural: [
    'how to', 'step', 'process', 'method', 'procedure', 'workflow',
    'first', 'then', 'next', 'finally', 'instruction', 'guide',
    'recipe', 'algorithm', 'approach', 'technique', 'way to',
  ],
  semantic: [
    'fact', 'definition', 'means', 'is a', 'refers to', 'known as',
    'concept', 'theory', 'principle', 'rule', 'law', 'property',
    'characteristic', 'attribute', 'belongs to', 'category of',
  ],
  general: [],
};

/**
 * Auto-categorize content based on keyword analysis.
 */
function autoCategorize(content: string): MemoryCategory {
  const lowerContent = content.toLowerCase();

  let bestCategory: MemoryCategory = 'general';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'general') continue;

    let score = 0;
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as MemoryCategory;
    }
  }

  return bestCategory;
}

/**
 * Extract tags from content using keyword analysis.
 */
function extractTags(content: string): string[] {
  const lowerContent = content.toLowerCase();
  const tags = new Set<string>();

  // Extract category-based tags
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'general') continue;
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) {
        tags.add(category);
        break;
      }
    }
  }

  // Extract topic tags (key nouns/phrases)
  const topicPatterns = [
    /\b(python|javascript|typescript|react|next\.js|node\.js|rust|go|java)\b/gi,
    /\b(api|database|server|client|frontend|backend|deploy|docker|kubernetes)\b/gi,
    /\b(email|calendar|task|project|team|meeting|report|document)\b/gi,
    /\b(sales|marketing|support|research|analytics|finance|accounting)\b/gi,
    /\b(twitter|facebook|instagram|linkedin|youtube|tiktok|whatsapp)\b/gi,
  ];

  for (const pattern of topicPatterns) {
    const matches = lowerContent.match(pattern);
    if (matches) {
      for (const match of matches) {
        tags.add(match.toLowerCase());
      }
    }
  }

  return Array.from(tags).slice(0, 10);
}

// ---------------------------------------------------------------------------
// TF-IDF style keyword scoring
// ---------------------------------------------------------------------------

/**
 * Tokenize text into lowercase words for matching.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Calculate term frequency for a set of tokens.
 */
function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const total = tokens.length;
  if (total === 0) return tf;

  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  // Normalize by total tokens
  for (const [key, val] of tf.entries()) {
    tf.set(key, val / total);
  }

  return tf;
}

/**
 * Calculate keyword match score between a query and content.
 * Uses a simplified TF-IDF approach: score based on how many
 * query terms appear in the content, weighted by term frequency.
 */
function keywordMatchScore(queryTokens: string[], contentTokens: string[]): number {
  if (queryTokens.length === 0 || contentTokens.length === 0) return 0;

  const contentTF = termFrequency(contentTokens);
  const querySet = new Set(queryTokens);

  let score = 0;
  let matchedTerms = 0;

  for (const qToken of queryTokens) {
    if (contentTF.has(qToken)) {
      score += contentTF.get(qToken)!;
      matchedTerms++;
    }
    // Also check for partial matches (prefix matching for flexibility)
    for (const [cToken, cFreq] of contentTF.entries()) {
      if (cToken.startsWith(qToken) || qToken.startsWith(cToken)) {
        if (!querySet.has(cToken)) {
          score += cFreq * 0.5; // Partial match gets half weight
          matchedTerms++;
        }
      }
    }
  }

  // Normalize by query length to avoid bias toward longer queries
  const coverage = matchedTerms / queryTokens.length;
  return Math.min(1, score * coverage);
}

// ---------------------------------------------------------------------------
// Relevance decay
// ---------------------------------------------------------------------------

/**
 * Calculate time-decayed relevance.
 * Memories accessed more recently are more relevant.
 * Uses exponential decay: relevance * e^(-lambda * days_since_access)
 */
function decayRelevance(
  baseRelevance: number,
  lastAccessedAt: Date,
  accessCount: number
): number {
  const now = new Date();
  const daysSinceAccess = (now.getTime() - lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);

  // Decay factor: lambda = 0.05 (half-life ~14 days)
  const lambda = 0.05;
  const decayFactor = Math.exp(-lambda * daysSinceAccess);

  // Access boost: memories accessed more often get a boost
  // Capped at 2x boost for very frequently accessed memories
  const accessBoost = Math.min(2, 1 + Math.log2(accessCount + 1) * 0.2);

  return Math.min(1, baseRelevance * decayFactor * accessBoost);
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Store a new memory with auto-categorization.
 */
export async function storeMemory(
  agentId: string,
  userId: string,
  content: string,
  options: StoreMemoryOptions = {}
): Promise<AgentMemoryResult> {
  // Auto-categorize if category not provided
  const category = options.category || autoCategorize(content);

  // Auto-extract tags if not provided
  const tags = options.tags || extractTags(content);

  // Calculate initial relevance
  let relevance = options.relevance ?? 0.5;
  // Boost relevance for explicitly categorized memories
  if (options.category) relevance = Math.min(1, relevance + 0.1);
  // Category-based initial relevance
  if (category === 'preference') relevance = Math.max(relevance, 0.7);
  if (category === 'procedural') relevance = Math.max(relevance, 0.6);

  // Check for duplicate/similar content
  const existingMemories = await db.agentMemory.findMany({
    where: {
      agentId,
      userId,
      content: { contains: content.substring(0, 50) },
    },
    take: 5,
  });

  // If very similar content exists, update it instead of creating duplicate
  for (const existing of existingMemories) {
    const similarity = calculateStringSimilarity(content, existing.content);
    if (similarity > 0.85) {
      // Merge: update relevance and access count
      const updated = await db.agentMemory.update({
        where: { id: existing.id },
        data: {
          relevance: Math.min(1, existing.relevance + 0.1),
          accessCount: existing.accessCount + 1,
          lastAccessedAt: new Date(),
          tags: JSON.stringify([...new Set([...tags, ...safeParseJSON<string[]>(existing.tags)])]),
        },
      });
      return serializeMemory(updated);
    }
  }

  const memory = await db.agentMemory.create({
    data: {
      agentId,
      userId,
      category,
      content,
      context: JSON.stringify(options.context || {}),
      source: options.source || 'interaction',
      relevance,
      tags: JSON.stringify(tags),
      expiresAt: options.expiresAt || null,
    },
  });

  return serializeMemory(memory);
}

/**
 * Retrieve relevant memories using keyword matching + relevance scoring.
 */
export async function retrieveMemories(
  agentId: string,
  userId: string,
  query: string,
  options: RetrieveMemoriesOptions = {}
): Promise<AgentMemoryResult[]> {
  const { category, limit = 10, minRelevance = 0.2, includeExpired = false } = options;

  // Build where clause
  const where: Record<string, unknown> = {
    agentId,
    userId,
  };

  if (category) {
    where.category = category;
  }

  if (!includeExpired) {
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ];
  }

  // Fetch candidate memories (get more than needed for scoring)
  const candidates = await db.agentMemory.findMany({
    where,
    orderBy: [
      { relevance: 'desc' },
      { lastAccessedAt: 'desc' },
    ],
    take: Math.min(limit * 5, 100),
  });

  if (candidates.length === 0) return [];

  // Score each memory using keyword matching + decayed relevance
  const queryTokens = tokenize(query);

  const scored = candidates.map((memory) => {
    const contentTokens = tokenize(memory.content);
    const keywordScore = keywordMatchScore(queryTokens, contentTokens);

    // Also search in tags
    const tagTokens = safeParseJSON<string[]>(memory.tags)
      .flat()
      .flatMap((t: string) => tokenize(t));
    const tagScore = keywordMatchScore(queryTokens, tagTokens);

    // Combined keyword score (content weighted more)
    const combinedKeywordScore = keywordScore * 0.8 + tagScore * 0.2;

    // Apply time-decayed relevance
    const decayedRelevance = decayRelevance(
      memory.relevance,
      memory.lastAccessedAt,
      memory.accessCount
    );

    // Final score: blend of keyword match and relevance
    // If no query provided, rely purely on relevance
    const finalScore = queryTokens.length > 0
      ? combinedKeywordScore * 0.6 + decayedRelevance * 0.4
      : decayedRelevance;

    return { memory, score: finalScore };
  });

  // Filter by minimum relevance threshold
  const filtered = scored
    .filter(({ score }) => score >= minRelevance)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Increment access count for retrieved memories (fire-and-forget)
  for (const { memory } of filtered) {
    incrementAccess(memory.id).catch(() => {});
  }

  return filtered.map(({ memory }) => serializeMemory(memory));
}

/**
 * Extract and store key learnings from a conversation.
 */
export async function learnFromInteraction(
  agentId: string,
  userId: string,
  userMessage: string,
  agentResponse: string
): Promise<AgentMemoryResult[]> {
  const learnings: AgentMemoryResult[] = [];

  // Extract preferences from user message
  const preferencePatterns = [
    /i (?:prefer|like|want|need|love|enjoy)\s+(.+?)(?:\.|,|$)/gi,
    /i (?:don't|dont|do not)\s+(?:like|want|need|prefer)\s+(.+?)(?:\.|,|$)/gi,
    /(?:always|never|usually)\s+(.+?)(?:\.|,|$)/gi,
    /(?:my favorite|my preferred)\s+(?:is|are)\s+(.+?)(?:\.|,|$)/gi,
    /please\s+(?:always|never)\s+(.+?)(?:\.|,|$)/gi,
  ];

  for (const pattern of preferencePatterns) {
    let match;
    while ((match = pattern.exec(userMessage)) !== null) {
      const content = `User prefers: ${match[1].trim()}`;
      const memory = await storeMemory(agentId, userId, content, {
        category: 'preference',
        source: 'interaction',
        context: { userMessage: userMessage.substring(0, 200), type: 'extracted_preference' },
        tags: ['auto-extracted', 'preference'],
        relevance: 0.7,
      });
      learnings.push(memory);
    }
  }

  // Extract procedural knowledge from agent response
  const proceduralPatterns = [
    /(?:to\s+)?(?:do|perform|execute|run|complete)\s+\w+,\s+(?:you\s+)?(?:first|then|need\s+to)\s+(.+?)(?:\.|,|$)/gi,
    /(?:step\s+\d+|first|then|next|finally)[:\s]+(.+?)(?:\.|,|$)/gi,
    /(?:the\s+)?(?:process|procedure|method|approach)\s+(?:is|would be)[:\s]+(.+?)(?:\.|$)/gi,
  ];

  for (const pattern of proceduralPatterns) {
    let match;
    while ((match = pattern.exec(agentResponse)) !== null) {
      const content = `Procedure: ${match[1].trim()}`;
      const memory = await storeMemory(agentId, userId, content, {
        category: 'procedural',
        source: 'observation',
        context: { agentResponse: agentResponse.substring(0, 200), type: 'extracted_procedure' },
        tags: ['auto-extracted', 'procedure'],
        relevance: 0.6,
      });
      learnings.push(memory);
    }
  }

  // Extract semantic/factual knowledge from agent response
  const semanticPatterns = [
    /(?:note|remember|important|key|fact)\s*(?:that|:)\s*(.+?)(?:\.|$)/gi,
    /(.+?)\s+(?:is defined as|refers to|means)\s+(.+?)(?:\.|$)/gi,
  ];

  for (const pattern of semanticPatterns) {
    let match;
    while ((match = pattern.exec(agentResponse)) !== null) {
      const content = pattern.source.includes('is defined as')
        ? `Fact: ${match[1].trim()} - ${match[2].trim()}`
        : `Fact: ${match[1].trim()}`;
      const memory = await storeMemory(agentId, userId, content, {
        category: 'semantic',
        source: 'observation',
        context: { agentResponse: agentResponse.substring(0, 200), type: 'extracted_fact' },
        tags: ['auto-extracted', 'fact'],
        relevance: 0.5,
      });
      learnings.push(memory);
    }
  }

  // Store episodic memory (summary of this interaction)
  const interactionSummary = userMessage.length > 100
    ? userMessage.substring(0, 100) + '...'
    : userMessage;

  const episodicMemory = await storeMemory(agentId, userId, `Interaction: User asked "${interactionSummary}"`, {
    category: 'episodic',
    source: 'interaction',
    context: {
      userMessage: userMessage.substring(0, 500),
      agentResponse: agentResponse.substring(0, 500),
      type: 'interaction_summary',
    },
    tags: ['auto-extracted', 'interaction', 'episodic'],
    relevance: 0.4,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // Episodic memories expire after 90 days
  });
  learnings.push(episodicMemory);

  return learnings;
}

/**
 * Get formatted context string for injection into AI prompts.
 */
export async function getMemoryContext(
  agentId: string,
  userId: string,
  query: string
): Promise<string> {
  const memories = await retrieveMemories(agentId, userId, query, {
    limit: 5,
    minRelevance: 0.15,
  });

  if (memories.length === 0) return '';

  const memoryLines = memories.map((m, i) => {
    const categoryLabel = m.category !== 'general' ? `[${m.category}]` : '';
    return `${i + 1}. ${categoryLabel} ${m.content}`;
  });

  return `## Agent Memory (learned from past interactions)
The following are things you've learned about this user and their preferences. Use this context to provide more personalized responses:

${memoryLines.join('\n')}

Use these memories naturally in your response when relevant. Do not explicitly mention that you "remember" or "have learned" these things unless the user asks about your memory.`;
}

/**
 * Clean up old/irrelevant memories.
 */
export async function pruneOldMemories(
  agentId: string,
  maxMemories: number = 500
): Promise<{ pruned: number; remaining: number }> {
  // Count total memories for this agent
  const total = await db.agentMemory.count({
    where: { agentId },
  });

  if (total <= maxMemories) {
    return { pruned: 0, remaining: total };
  }

  // Delete expired memories first
  const expiredDeleted = await db.agentMemory.deleteMany({
    where: {
      agentId,
      expiresAt: { lt: new Date() },
    },
  });

  // Count remaining after expired cleanup
  const afterExpired = await db.agentMemory.count({
    where: { agentId },
  });

  if (afterExpired <= maxMemories) {
    return { pruned: expiredDeleted.count, remaining: afterExpired };
  }

  // Find memories to remove: lowest relevance + oldest access
  const toRemoveCount = afterExpired - maxMemories;

  // Get IDs of the least relevant, least accessed, oldest memories
  const toRemove = await db.agentMemory.findMany({
    where: { agentId },
    orderBy: [
      { relevance: 'asc' },
      { accessCount: 'asc' },
      { lastAccessedAt: 'asc' },
    ],
    take: toRemoveCount,
    select: { id: true },
  });

  const idsToRemove = toRemove.map((m) => m.id);

  const { count: prunedCount } = await db.agentMemory.deleteMany({
    where: {
      id: { in: idsToRemove },
    },
  });

  const remaining = await db.agentMemory.count({
    where: { agentId },
  });

  return {
    pruned: expiredDeleted.count + prunedCount,
    remaining,
  };
}

/**
 * Get statistics about an agent's knowledge.
 */
export async function getAgentMemoryStats(agentId: string): Promise<MemoryStats> {
  const memories = await db.agentMemory.findMany({
    where: {
      agentId,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  // Category breakdown
  const categories: Record<string, number> = {};
  for (const memory of memories) {
    categories[memory.category] = (categories[memory.category] || 0) + 1;
  }

  // Average relevance
  const averageRelevance = memories.length > 0
    ? memories.reduce((sum, m) => sum + m.relevance, 0) / memories.length
    : 0;

  // Most accessed
  const mostAccessed = [...memories]
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, 5)
    .map((m) => ({ id: m.id, content: m.content, accessCount: m.accessCount }));

  // Recent memories
  const recentMemories = memories.slice(0, 5).map((m) => ({
    id: m.id,
    content: m.content,
    createdAt: m.createdAt,
  }));

  // Top tags
  const tagCounts: Record<string, number> = {};
  for (const memory of memories) {
    const tags = safeParseJSON<string[]>(memory.tags);
    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  return {
    totalMemories: memories.length,
    categories,
    averageRelevance: Math.round(averageRelevance * 100) / 100,
    mostAccessed,
    recentMemories,
    topTags,
  };
}

/**
 * Track memory usage for relevance scoring.
 */
export async function incrementAccess(memoryId: string): Promise<void> {
  await db.agentMemory.update({
    where: { id: memoryId },
    data: {
      accessCount: { increment: 1 },
      lastAccessedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate simple string similarity (Jaccard-like).
 */
function calculateStringSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Safely parse JSON string, returning fallback on failure.
 */
function safeParseJSON<T>(jsonString: string): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return [] as unknown as T;
  }
}

/**
 * Serialize a Prisma AgentMemory record for API output.
 */
interface AgentMemoryResult {
  id: string;
  agentId: string;
  userId: string;
  category: string;
  content: string;
  context: string;
  source: string;
  relevance: number;
  accessCount: number;
  tags: string[];
  embedding: string | null;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date | null;
}

function serializeMemory(memory: {
  id: string;
  agentId: string;
  userId: string;
  category: string;
  content: string;
  context: string;
  source: string;
  relevance: number;
  accessCount: number;
  tags: string;
  embedding: string | null;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date | null;
}): AgentMemoryResult {
  return {
    ...memory,
    tags: safeParseJSON<string[]>(memory.tags),
  };
}
