import { NextRequest } from 'next/server';
import { streamChat } from '@/lib/ai-router';
import { db } from '@/lib/db';

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

    // Build system prompt from agent config
    const systemPrompt = `Tu es ${agent.name}, un agent IA spécialisé en ${agent.type}.
${config.instructions || 'Tu assistes l\'utilisateur dans tes domaines de compétence.'}
${config.personality ? `Personnalité: ${config.personality}` : ''}
Outils disponibles: ${(config.tools || []).join(', ') || 'Aucun outil spécifique'}
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

    // Stream response
    const stream = await streamChat(conversationMessages, resolvedTaskType);

    let fullResponse = '';
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        fullResponse += new TextDecoder().decode(chunk);
        controller.enqueue(chunk);
      },
      async flush() {
        try {
          const lines = fullResponse.split('\n');
          let assistantContent = '';
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const json = JSON.parse(line.slice(6));
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) assistantContent += delta;
              } catch {
                // skip unparseable lines
              }
            }
          }
          if (convId && assistantContent) {
            await db.message.create({
              data: { role: 'assistant', content: assistantContent, model: 'auto-routed', provider: 'groq/openrouter', conversationId: convId },
            });
          }
        } catch {
          // fail silently on save error
        }
      },
    });

    const transformedStream = stream.pipeThrough(transformStream);

    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Conversation-Id': convId,
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
