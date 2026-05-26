// Short-term Memory — Manages conversation context

import { db } from '@/lib/db';
import { chatCompletion } from '@/lib/ai-router';

export class ShortTermMemory {
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
   * Summarize older messages to save tokens
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
            content: 'Tu es un assistant qui résume des conversations. Résume la conversation suivante en conservant les informations clés, les décisions prises et les contextes importants. Réponds en français.',
          },
          { role: 'user', content: oldContent },
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
   * Get context window that fits within a token limit
   * Simple approximation: ~4 chars per token
   */
  async getContextWindow(
    conversationId: string,
    maxTokens: number = 4000
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });

    const result: Array<{ role: string; content: string }> = [];
    let tokenCount = 0;

    for (const msg of messages.reverse()) {
      const msgTokens = Math.ceil(msg.content.length / 4);
      if (tokenCount + msgTokens > maxTokens) break;
      result.push({ role: msg.role, content: msg.content });
      tokenCount += msgTokens;
    }

    return result;
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
}
