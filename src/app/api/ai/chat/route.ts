import { NextRequest } from 'next/server';
import { streamChat } from '@/lib/ai-router';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';
import { validateBody, aiChatSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'ai' });
    if (error) return error;

    const body = await request.json();
    const validation = validateBody(aiChatSchema, body);
    if (!validation.success) {
      return new Response(JSON.stringify(validation.error), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const { messages } = validation.data;
    const conversationId = body.conversationId as string | undefined;
    const taskType = body.taskType || 'quick_chat';

    let conversationMessages: Array<{ role: string; content: string }> = [];
    if (conversationId) {
      const conv = await db.conversation.findUnique({ where: { id: conversationId } });
      if (conv && conv.userId !== auth!.userId) {
        return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      const history = await db.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 20 });
      conversationMessages = history.map(m => ({ role: m.role, content: m.content }));
    }

    const allMessages = [...conversationMessages, ...messages];

    let convId = conversationId;
    if (!convId) {
      const conv = await db.conversation.create({
        data: { title: messages[messages.length - 1]?.content?.substring(0, 50) || 'Nouvelle conversation', type: 'automation', userId: auth!.userId },
      });
      convId = conv.id;
    }

    const lastUserMsg = messages.filter((m: { role: string }) => m.role === 'user').pop();
    if (lastUserMsg && convId) {
      await db.message.create({ data: { role: 'user', content: lastUserMsg.content, conversationId: convId } });
    }

    const stream = await streamChat(allMessages, taskType);
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
              try { const json = JSON.parse(line.slice(6)); const delta = json.choices?.[0]?.delta?.content; if (delta) assistantContent += delta; } catch { /* skip */ }
            }
          }
          if (convId && assistantContent) {
            await db.message.create({ data: { role: 'assistant', content: assistantContent, model: 'auto-routed', provider: 'groq/openrouter', conversationId: convId } });
          }
        } catch { /* fail silently */ }
      },
    });

    return new Response(stream.pipeThrough(transformStream), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Conversation-Id': convId || '' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
