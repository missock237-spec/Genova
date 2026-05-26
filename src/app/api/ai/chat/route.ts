import { NextRequest } from 'next/server';
import { streamChat } from '@/lib/ai-router';
import { db } from '@/lib/db';

// Streaming chat endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, conversationId, userId, taskType = 'quick_chat' } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages requis' }), { status: 400 });
    }

    // If conversationId provided, load conversation history for memory
    let conversationMessages: Array<{ role: string; content: string }> = [];
    if (conversationId) {
      const history = await db.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 20, // Last 20 messages for context
      });
      conversationMessages = history.map(m => ({ role: m.role, content: m.content }));
    }

    // Combine history with new messages
    const allMessages = [...conversationMessages, ...messages];

    // Get or create conversation
    let convId = conversationId;
    if (!convId && userId) {
      const conv = await db.conversation.create({
        data: {
          title: messages[messages.length - 1]?.content?.substring(0, 50) || 'Nouvelle conversation',
          type: 'automation',
          userId,
        },
      });
      convId = conv.id;
    }

    // Save user message
    if (convId) {
      const lastUserMsg = messages.filter((m: { role: string }) => m.role === 'user').pop();
      if (lastUserMsg) {
        await db.message.create({
          data: {
            role: 'user',
            content: lastUserMsg.content,
            conversationId: convId,
          },
        });
      }
    }

    // Stream the response
    const stream = await streamChat(allMessages, taskType);

    // Create a TransformStream to save the full response after streaming
    let fullResponse = '';
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        fullResponse += new TextDecoder().decode(chunk);
        controller.enqueue(chunk);
      },
      async flush() {
        // After streaming completes, extract and save assistant message
        try {
          // Parse SSE data to get content
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
              data: {
                role: 'assistant',
                content: assistantContent,
                model: 'auto-routed',
                provider: 'groq/openrouter',
                conversationId: convId,
              },
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
        'X-Conversation-Id': convId || '',
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
