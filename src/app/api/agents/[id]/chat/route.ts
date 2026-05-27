import { NextRequest } from 'next/server';
import { streamChat } from '@/lib/ai-router';
import { db } from '@/lib/db';
import { getStreamManager, SSEEncoder, type StreamEvent, type ProgressUpdate } from '@/lib/streaming';
import { LongTermMemory } from '@/lib/memory/long-term';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { message, conversationId, taskType = 'quick_chat' } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message requis' }), { status: 400 });
    }

    const agent = await db.agent.findUnique({
      where: { id },
      include: {
        conversations: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
        },
      },
    });

    if (!agent) {
      return new Response(JSON.stringify({ error: 'Agent non trouvé' }), { status: 404 });
    }

    const config = JSON.parse(agent.config || '{}');

    // Load long-term memory context for this agent
    const longTermMemory = new LongTermMemory();
    const memoryContext = await longTermMemory.getContextForQuery(message, agent.userId);

    // Build system prompt from agent config + memory
    const systemPrompt = `Tu es ${agent.name}, un agent IA spécialisé en ${agent.type}.
${config.instructions || 'Tu assistes l\'utilisateur dans tes domaines de compétence.'}
${config.personality ? `Personnalité: ${config.personality}` : ''}
Outils disponibles: ${(config.tools || []).join(', ') || 'Aucun outil spécifique'}
${memoryContext ? `\nMémoire à long terme pertinente:\n${memoryContext}` : ''}
Réponds toujours en français de manière professionnelle et utile.`;

    // Load conversation history
    const conversationMessages: Array<{ role: string; content: string }> = [{ role: 'system', content: systemPrompt }];

    if (conversationId) {
      const history = await db.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      conversationMessages.push(...history.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })));
    } else if (agent.conversations?.[0]?.messages) {
      conversationMessages.push(...agent.conversations[0].messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })));
    }

    conversationMessages.push({ role: 'user', content: message });

    // Determine best task type based on agent type
    const agentTaskMap: Record<string, string> = {
      sales: 'quick_chat',
      support: 'quick_chat',
      marketing: 'marketing',
      research: 'analysis',
      rh: 'quick_chat',
      accounting: 'analysis',
      custom: 'quick_chat',
    };
    const resolvedTaskType = (taskType || agentTaskMap[agent.type] || 'quick_chat') as 'quick_chat' | 'reasoning' | 'code' | 'marketing' | 'analysis' | 'orchestration' | 'validation';

    // Save user message
    let convId = conversationId;
    if (!convId) {
      const conv = await db.conversation.create({
        data: {
          title: message.substring(0, 50),
          type: 'agent_chat',
          agentId: agent.id,
          userId: agent.userId,
        },
      });
      convId = conv.id;
    }

    await db.message.create({
      data: { role: 'user', content: message, conversationId: convId },
    });

    // Stream response using advanced streaming architecture
    const aiStream = await streamChat(conversationMessages, resolvedTaskType);

    // Create enhanced SSE stream with structured events
    const encoder = new TextEncoder();
    let fullResponse = '';
    let tokenCount = 0;
    const startTime = Date.now();

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.slice(6));
              const delta = json.choices?.[0]?.delta?.content;

              if (delta) {
                fullResponse += delta;
                tokenCount++;

                // Send structured token event
                const tokenEvent: StreamEvent = {
                  id: `evt_${Date.now()}_${tokenCount}`,
                  type: 'token',
                  data: { token: delta, model: json.model },
                  timestamp: new Date().toISOString(),
                };
                controller.enqueue(encoder.encode(SSEEncoder.encode(tokenEvent)));
              }
            } catch {
              // Forward raw chunk for non-JSON data
              controller.enqueue(chunk);
            }
          } else if (line.startsWith('data: [DONE]')) {
            // Send completion event
            const completeEvent: StreamEvent = {
              id: `evt_${Date.now()}_complete`,
              type: 'complete',
              data: {
                fullResponse,
                tokenCount,
                duration: Date.now() - startTime,
                conversationId: convId,
              },
              timestamp: new Date().toISOString(),
            };
            controller.enqueue(encoder.encode(SSEEncoder.encode(completeEvent)));
            controller.enqueue(encoder.encode(SSEEncoder.done()));
          } else {
            // Forward other SSE lines
            controller.enqueue(encoder.encode(line + '\n'));
          }
        }
      },
      async flush() {
        try {
          if (convId && fullResponse) {
            await db.message.create({
              data: {
                role: 'assistant',
                content: fullResponse,
                model: 'auto-routed',
                provider: 'groq/openrouter',
                conversationId: convId,
              },
            });

            // Extract and store learnings in long-term memory
            try {
              const ltm = new LongTermMemory();
              const keywords = fullResponse.split(/\s+/).filter(w => w.length > 4).slice(0, 5);
              await ltm.store({
                content: `${agent.name}: ${fullResponse.substring(0, 500)}`,
                category: 'agent_learning',
                tags: [agent.type, ...keywords],
                source: 'conversation',
                relevance: 0.6,
                userId: agent.userId,
              });
            } catch {
              // Fail silently on memory store error
            }
          }
        } catch {
          // fail silently on save error
        }
      },
    });

    const decoder = new TextDecoder();
    const transformedStream = aiStream.pipeThrough(transformStream);

    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Conversation-Id': convId,
        'X-Stream-Version': '2.0',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
