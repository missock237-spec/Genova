import { NextRequest, NextResponse } from 'next/server';
import { createAIRouter } from '@/lib/ai-router';
import { applySecurity, secureResponse } from '@/lib/security';
import { createLogger } from '@/lib/logger';

const log = createLogger('ai-chat');

const MAX_HISTORY_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_TOTAL_HISTORY_SIZE = 20000;

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 20, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { message, history } = body;

    if (!message) {
      const res = NextResponse.json({ error: 'Message requis' }, { status: 400 });
      return secureResponse(res, request);
    }

    if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) {
      const res = NextResponse.json({ error: `Message trop long (max ${MAX_MESSAGE_LENGTH} caractères)` }, { status: 400 });
      return secureResponse(res, request);
    }

    // Validate history
    const validatedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (history !== undefined && history !== null) {
      if (!Array.isArray(history)) {
        const res = NextResponse.json({ error: 'History doit être un tableau' }, { status: 400 });
        return secureResponse(res, request);
      }

      if (history.length > MAX_HISTORY_LENGTH) {
        const res = NextResponse.json({ error: `History trop longue (max ${MAX_HISTORY_LENGTH} messages)` }, { status: 400 });
        return secureResponse(res, request);
      }

      let totalSize = 0;

      for (const m of history) {
        if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') {
          const res = NextResponse.json({ error: 'Format de message invalide dans history' }, { status: 400 });
          return secureResponse(res, request);
        }

        if (!['user', 'assistant'].includes(m.role)) {
          const res = NextResponse.json({ error: 'Rôle invalide dans history (user ou assistant uniquement)' }, { status: 400 });
          return secureResponse(res, request);
        }

        const content = String(m.content).slice(0, MAX_MESSAGE_LENGTH);
        totalSize += content.length;

        if (totalSize > MAX_TOTAL_HISTORY_SIZE) {
          const res = NextResponse.json({ error: 'History trop volumineuse' }, { status: 400 });
          return secureResponse(res, request);
        }

        validatedHistory.push({
          role: m.role as 'user' | 'assistant',
          content,
        });
      }
    }

    const router = createAIRouter(auth.userId);

    const messages = [
      {
        role: 'system' as const,
        content: `Tu es l'assistant AgentOS, un IA qui aide les utilisateurs à contrôler leur système d'agents IA. Tu parles en français. Tu aides à comprendre les commandes en langage naturel et à les transformer en actions. Tu es concis et professionnel. Réponds toujours en français.`,
      },
      ...validatedHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    const response = await router.chat(messages, { model: 'default' });

    const res = NextResponse.json({
      reply: response.content,
      usage: response.usage,
      provider: response.provider,
      model: response.model,
      costUsd: response.costUsd,
    });
    return secureResponse(res, request);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error('AI chat failed', { error: errMsg });
    const res = NextResponse.json({
      error: 'Erreur lors de la communication avec l\'IA',
      details: process.env.NODE_ENV === 'development' ? errMsg : undefined,
    }, { status: 500 });
    return secureResponse(res, request);
  }
}
