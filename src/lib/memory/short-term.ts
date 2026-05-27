// Short-term Memory — Advanced conversation context management
// Features: Token-budget aware context, auto-summarization, context prioritization, sliding window

import { db } from '@/lib/db';
import { chatCompletion } from '@/lib/ai-router';

export interface ContextMessage {
  role: string;
  content: string;
  timestamp?: string;
  importance?: number; // 0-1, higher = more important to keep
  tokenEstimate?: number;
}

export interface ContextWindow {
  messages: ContextMessage[];
  totalTokens: number;
  maxTokens: number;
  summarizedCount: number;
}

export class ShortTermMemory {
  // Approximate tokens per character (conservative estimate for mixed FR/EN)
  private static readonly CHARS_PER_TOKEN = 3.5;

  /**
   * Get conversation context (last N messages)
   */
  async getContext(
    conversationId: string,
    maxMessages: number = 20
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: maxMessages,
    });

    return messages
      .reverse()
      .map(m => ({ role: m.role, content: m.content }));
  }

  /**
   * Add a message to the conversation context
   */
  async addMessage(
    conversationId: string,
    role: string,
    content: string,
    model?: string,
    provider?: string
  ): Promise<void> {
    await db.message.create({
      data: {
        role,
        content,
        model,
        provider,
        conversationId,
      },
    });
  }

  /**
   * Get context window that fits within a token budget
   * Uses smart prioritization: keeps recent messages + important older messages
   */
  async getContextWindow(
    conversationId: string,
    maxTokens: number = 4000
  ): Promise<ContextWindow> {
    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) {
      return { messages: [], totalTokens: 0, maxTokens, summarizedCount: 0 };
    }

    // Calculate token estimates and importance for each message
    const contextMessages: ContextMessage[] = messages.map(m => {
      const tokenEstimate = Math.ceil(m.content.length / ShortTermMemory.CHARS_PER_TOKEN);
      const importance = this.estimateMessageImportance(m.content, m.role);

      return {
        role: m.role,
        content: m.content,
        timestamp: m.createdAt.toISOString(),
        importance,
        tokenEstimate,
      };
    });

    // Strategy: Always keep the last N messages, fill remaining budget with important older messages
    const result: ContextMessage[] = [];
    let tokenCount = 0;

    // 1. Always include the last 4 messages (2 exchanges)
    const recentMessages = contextMessages.slice(-4);
    for (const msg of recentMessages) {
      result.push(msg);
      tokenCount += msg.tokenEstimate || Math.ceil(msg.content.length / 4);
    }

    // 2. If we have budget left, add more recent messages
    if (tokenCount < maxTokens) {
      const remainingRecent = contextMessages.slice(-10, -4).reverse();
      for (const msg of remainingRecent) {
        if (tokenCount + (msg.tokenEstimate || Math.ceil(msg.content.length / 4)) > maxTokens * 0.7) break;
        result.unshift(msg);
        tokenCount += msg.tokenEstimate || Math.ceil(msg.content.length / 4);
      }
    }

    // 3. If we still have budget, add important older messages
    if (tokenCount < maxTokens * 0.7) {
      const olderMessages = contextMessages.slice(0, -10)
        .filter(m => m.importance && m.importance > 0.6)
        .sort((a, b) => (b.importance || 0) - (a.importance || 0));

      for (const msg of olderMessages) {
        if (tokenCount + (msg.tokenEstimate || Math.ceil(msg.content.length / 4)) > maxTokens * 0.8) break;
        result.unshift(msg);
        tokenCount += msg.tokenEstimate || Math.ceil(msg.content.length / 4);
      }
    }

    // 4. If still too many tokens, summarize the oldest part
    let summarizedCount = 0;
    while (tokenCount > maxTokens && result.length > 4) {
      const oldest = result.shift();
      if (oldest) {
        tokenCount -= oldest.tokenEstimate || Math.ceil(oldest.content.length / 4);
        summarizedCount++;
      }
    }

    return {
      messages: result,
      totalTokens: tokenCount,
      maxTokens,
      summarizedCount,
    };
  }

  /**
   * Summarize older messages to save tokens using LLM
   */
  async summarizeOldMessages(conversationId: string): Promise<string> {
    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length <= 10) {
      return messages.map(m => `${m.role}: ${m.content}`).join('\n');
    }

    // Summarize all but the last 10 messages
    const oldMessages = messages.slice(0, -10);
    const oldContent = oldMessages.map(m => `${m.role}: ${m.content}`).join('\n');

    try {
      const result = await chatCompletion(
        [
          {
            role: 'system',
            content: `Tu es un assistant qui résume des conversations de manière concise. Résume la conversation suivante en conservant:
1. Les informations clés et les décisions prises
2. Les contextes importants pour la suite
3. Les préférences exprimées par l'utilisateur
4. Les résultats obtenus
Réponds en français avec un résumé structuré.`,
          },
          { role: 'user', content: oldContent.substring(0, 6000) },
        ],
        'quick_chat'
      );
      return result.content;
    } catch {
      // If summarization fails, return last 5 messages
      return oldMessages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
    }
  }

  /**
   * Get or create a conversation
   */
  async getOrCreateConversation(
    userId: string,
    title: string,
    type: string = 'automation',
    agentId?: string
  ): Promise<string> {
    const conversation = await db.conversation.create({
      data: {
        title,
        type,
        userId,
        agentId,
      },
    });
    return conversation.id;
  }

  /**
   * Estimate the importance of a message for context retention
   */
  private estimateMessageImportance(content: string, role: string): number {
    let importance = 0.5; // Base importance

    // User messages with questions are more important
    if (role === 'user') {
      if (content.includes('?')) importance += 0.1;
      if (content.length > 100) importance += 0.05; // Detailed requests
    }

    // System messages are important
    if (role === 'system') importance += 0.2;

    // Messages with specific keywords are more important
    const importantKeywords = ['important', 'crucial', 'obligatoire', 'ne jamais', 'toujours', 'priorité', 'urgent', 'attention'];
    for (const keyword of importantKeywords) {
      if (content.toLowerCase().includes(keyword)) {
        importance += 0.1;
        break;
      }
    }

    // Messages with code/data are important
    if (content.includes('```') || content.includes('{')) importance += 0.1;

    // Very short messages are less important (unless questions)
    if (content.length < 20 && role !== 'user') importance -= 0.1;

    return Math.min(1, Math.max(0, importance));
  }
}
