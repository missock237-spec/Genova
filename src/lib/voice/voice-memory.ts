/**
 * Voice Memory — Store and retrieve voice-based memories
 *
 * Enables the AI to remember voice conversations, preferences, and patterns.
 * Features:
 *   - Store transcriptions with optional audio embeddings
 *   - Search memories by text similarity (keyword matching with relevance scoring)
 *   - Learn voice preferences from interactions
 *   - Provide conversation context from past voice memories
 */

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('voice-memory');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceMemoryEntry {
  id: string;
  userId: string;
  agentId?: string;
  type: 'preference' | 'conversation' | 'command' | 'emotion';
  transcription: string;
  audioEmbedding?: number[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface MemorySearchResult {
  id: string;
  content: string;
  category: string;
  confidence: number;
  tags: string[];
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Keyword extraction for simple similarity search
// ---------------------------------------------------------------------------

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'like',
    'through', 'after', 'over', 'between', 'out', 'against', 'during',
    'without', 'before', 'under', 'around', 'among', 'and', 'but', 'or',
    'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
    'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
    'just', 'because', 'if', 'when', 'while', 'how', 'what', 'which',
    'who', 'whom', 'this', 'that', 'these', 'those', 'i', 'me', 'my',
    'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
    'it', 'its', 'they', 'them', 'their',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function computeRelevance(queryKeywords: string[], contentKeywords: string[]): number {
  if (queryKeywords.length === 0 || contentKeywords.length === 0) return 0;

  let matches = 0;
  for (const qk of queryKeywords) {
    if (contentKeywords.some((ck) => ck.includes(qk) || qk.includes(ck))) {
      matches++;
    }
  }

  return matches / queryKeywords.length;
}

// ---------------------------------------------------------------------------
// VoiceMemorySystem class
// ---------------------------------------------------------------------------

export class VoiceMemorySystem {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Store a voice memory from a conversation
   */
  async storeMemory(
    userId: string,
    transcription: string,
    audioBuffer?: Buffer,
    metadata: Record<string, unknown> = {},
  ): Promise<VoiceMemoryEntry> {
    const type = (metadata.type as VoiceMemoryEntry['type']) ?? 'conversation';
    const agentId = metadata.agentId as string | undefined;
    const category = this.classifyCategory(transcription, type);

    // Generate simple embedding from keywords (placeholder for real embedding model)
    const keywords = extractKeywords(transcription);
    const audioEmbedding = audioBuffer
      ? this.generateSimpleEmbedding(audioBuffer)
      : undefined;

    try {
      const record = await db.voiceMemory.create({
        data: {
          userId,
          voiceSessionId: metadata.sessionId as string | undefined,
          category,
          content: transcription,
          embedding: audioEmbedding ? JSON.stringify(audioEmbedding) : undefined,
          durationMs: metadata.durationMs as number | undefined ?? 0,
          language: (metadata.language as string) ?? 'en-US',
          confidence: (metadata.confidence as number) ?? 0.8,
          tags: JSON.stringify(keywords.slice(0, 20)),
          metadata: JSON.stringify(metadata),
        },
      });

      log.info('Voice memory stored', {
        memoryId: record.id,
        category,
        contentLength: transcription.length,
        keywords: keywords.length,
      });

      return {
        id: record.id,
        userId: record.userId,
        agentId,
        type,
        transcription: record.content,
        audioEmbedding,
        metadata,
        createdAt: record.createdAt.toISOString(),
      };
    } catch (error) {
      log.error('Failed to store voice memory', { error: String(error) });
      throw error;
    }
  }

  /**
   * Search voice memories by text similarity
   */
  async searchMemories(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<VoiceMemoryEntry[]> {
    const queryKeywords = extractKeywords(query);

    try {
      // Fetch recent memories for this user
      const memories = await db.voiceMemory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit * 5, 200), // Over-fetch for scoring
      });

      // Score and rank by keyword relevance
      const scored: Array<{ memory: typeof memories[number]; score: number }> = memories.map((m) => {
        const contentKeywords = extractKeywords(m.content);
        const tagKeywords = JSON.parse(m.tags || '[]') as string[];
        const allKeywords = [...contentKeywords, ...tagKeywords];

        const textScore = computeRelevance(queryKeywords, allKeywords);
        const recencyBonus = Math.max(0, 1 - (Date.now() - m.createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000)); // 7-day decay
        const confidenceScore = m.confidence;

        return {
          memory: m,
          score: textScore * 0.7 + recencyBonus * 0.2 + confidenceScore * 0.1,
        };
      });

      // Sort by score descending and take top results
      scored.sort((a, b) => b.score - a.score);

      return scored.slice(0, limit).map(({ memory }) => ({
        id: memory.id,
        userId: memory.userId,
        type: (memory.category === 'command' ? 'command'
          : memory.category === 'preference' ? 'preference'
          : memory.category === 'emotion' ? 'emotion'
          : 'conversation') as VoiceMemoryEntry['type'],
        transcription: memory.content,
        metadata: JSON.parse(memory.metadata || '{}'),
        createdAt: memory.createdAt.toISOString(),
      }));
    } catch (error) {
      log.error('Failed to search voice memories', { error: String(error) });
      return [];
    }
  }

  /**
   * Get voice preferences for a user (learned from voice interactions)
   */
  async getVoicePreferences(
    userId: string,
  ): Promise<Record<string, unknown>> {
    try {
      const preferenceMemories = await db.voiceMemory.findMany({
        where: {
          userId,
          category: 'preference',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      // Also check voice profile
      const voiceProfile = await db.voiceProfile.findUnique({
        where: { userId },
      });

      const preferences: Record<string, unknown> = {
        voiceProfile: voiceProfile ? {
          language: voiceProfile.language,
          voiceModel: voiceProfile.voiceModel,
          speed: voiceProfile.speed,
          provider: voiceProfile.provider,
        } : null,
        learnedPreferences: preferenceMemories.map((m) => ({
          content: m.content,
          confidence: m.confidence,
          learnedAt: m.createdAt,
        })),
      };

      return preferences;
    } catch (error) {
      log.error('Failed to get voice preferences', { error: String(error) });
      return {};
    }
  }

  /**
   * Get conversation context from voice memories for a current query
   */
  async getConversationContext(
    userId: string,
    currentQuery: string,
  ): Promise<string> {
    const memories = await this.searchMemories(userId, currentQuery, 5);

    if (memories.length === 0) return '';

    const contextParts = memories.map((m, i) =>
      `[Memory ${i + 1} - ${m.type}]: ${m.transcription.slice(0, 200)}`
    );

    return `Relevant voice memories:\n${contextParts.join('\n')}`;
  }

  /**
   * Delete a voice memory by ID
   */
  async deleteMemory(memoryId: string): Promise<boolean> {
    try {
      await db.voiceMemory.delete({
        where: { id: memoryId },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all memories for a user with pagination
   */
  async listMemories(
    userId: string,
    options: {
      category?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ memories: MemorySearchResult[]; total: number }> {
    const { category, limit = 20, offset = 0 } = options;

    try {
      const where = {
        userId,
        ...(category ? { category } : {}),
      };

      const [memories, total] = await Promise.all([
        db.voiceMemory.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        db.voiceMemory.count({ where }),
      ]);

      return {
        memories: memories.map((m) => ({
          id: m.id,
          content: m.content,
          category: m.category,
          confidence: m.confidence,
          tags: JSON.parse(m.tags || '[]'),
          createdAt: m.createdAt,
        })),
        total,
      };
    } catch (error) {
      log.error('Failed to list voice memories', { error: String(error) });
      return { memories: [], total: 0 };
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private classifyCategory(
    transcription: string,
    type: VoiceMemoryEntry['type'],
  ): string {
    const lower = transcription.toLowerCase();

    // Auto-classify based on content patterns
    if (type === 'preference' || lower.includes('i prefer') || lower.includes('i like') || lower.includes('i want')) {
      return 'preference';
    }
    if (type === 'command' || lower.startsWith('call ') || lower.startsWith('send ') || lower.startsWith('schedule ')) {
      return 'command';
    }
    if (type === 'emotion' || lower.includes('i feel') || lower.includes('i\'m happy') || lower.includes('i\'m sad') || lower.includes('i\'m frustrated')) {
      return 'emotion';
    }

    return 'general';
  }

  private generateSimpleEmbedding(audioBuffer: Buffer): number[] {
    // Generate a simple hash-based embedding vector (256 dimensions)
    // This is a placeholder — in production, use a real audio embedding model
    const embedding: number[] = [];
    const dim = 256;
    const chunkSize = Math.max(1, Math.floor(audioBuffer.length / dim));

    for (let i = 0; i < dim; i++) {
      let sum = 0;
      const start = i * chunkSize;
      for (let j = start; j < Math.min(start + chunkSize, audioBuffer.length); j++) {
        sum += audioBuffer[j] ?? 0;
      }
      // Normalize to [-1, 1]
      embedding.push((sum / (chunkSize * 128)) - 1);
    }

    return embedding;
  }
}
