// ============================================================
// POST /api/agents/chat — @deprecated
// ============================================================
//  Route legacy (non-streaming). Préférer :
//    POST /api/agents/[id]/chat  (streaming SSE, messages persistés)
//
//  Cette route est conservée pour la rétrocompatibilité avec
//  d'anciens hooks (use-chat-stream.ts) mais ne sera plus
//   maintenue activement.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { createAIRouter } from '@/lib/ai-router';
import { getMemoryContext, learnFromInteraction } from '@/lib/agent-memory';
import { checkTokenLimit } from '@/lib/usage-limits';
import { createLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = createLogger('agents-chat-aggregate');
const MAX_MESSAGE_LENGTH = 5000;

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
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { message, agentId, conversationId } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message must be at most ${MAX_MESSAGE_LENGTH} characters` },
        { status: 400 },
      );
    }

    // If no agentId provided, use the default Gen3ia assistant behavior
    if (!agentId) {
      const router = createAIRouter(auth.userId);
      const messages = [
        {
          role: 'system' as const,
          content: `Tu es Gen3ia, un assistant IA qui aide les utilisateurs a controler leur systeme d'agents IA. Tu parles en francais. Tu es concis et professionnel.`,
        },
        { role: 'user' as const, content: message },
      ];

      const response = await router.chat(messages, { model: 'default' });

      return NextResponse.json({
        response: response.content,
        conversationId: conversationId || null,
      });
    }

    // ============================================================
    // Find the agent
    // ============================================================
    const agent = await db.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent || (agent as Record<string, unknown>).userId !== auth.userId) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const agentRecord = agent as Record<string, unknown>;

    // Check if agent is active
    if (agentRecord.status !== 'active') {
      return NextResponse.json({ error: 'Agent is not active' }, { status: 403 });
    }

    // ============================================================
    // Check daily token limit
    // ============================================================
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: ['plan'],
    });
    const plan = ((user as Record<string, unknown> | null)?.plan as string) || 'free';
    const tokenCheck = await checkTokenLimit(auth.userId, plan);

    if (!tokenCheck.allowed) {
      return NextResponse.json({
        error: `Daily token limit reached (${tokenCheck.current}/${tokenCheck.limit})`,
        code: 'TOKEN_LIMIT_REACHED',
      }, { status: 429 });
    }

    // ============================================================
    // Build system prompt from agent config
    // ============================================================
    let agentConfig: Record<string, unknown> = {};
    try {
      agentConfig = JSON.parse((agentRecord.config as string) || '{}');
    } catch {
      agentConfig = {};
    }

    const personality = (agentConfig as { personality?: string }).personality || 'helpful and professional';
    const instructions = (agentConfig as { instructions?: string }).instructions || '';

    // Get granted permissions
    const permissions = await db.agentPermission.findMany({
      where: [
        { field: 'agentId', op: '==', value: agentId },
        { field: 'userId', op: '==', value: auth.userId },
      ],
    });
    const grantedPermissions = (permissions as Record<string, unknown>[])
      .filter((p) => p.granted)
      .map((p) => p.permission as string);

    // Retrieve relevant memories
    const memoryContext = await getMemoryContext(agentId, auth.userId, message);

    const systemPrompt = `You are ${agentRecord.name as string}, an AI agent with the following characteristics:
- Type: ${agentRecord.type}
- Personality: ${personality}
${instructions ? `- Special Instructions: ${instructions}` : ''}

Your granted permissions are: ${grantedPermissions.length > 0 ? grantedPermissions.join(', ') : 'none'}

When a user asks you to do something that requires a permission you don't have, politely inform them that you lack that capability.

${memoryContext ? memoryContext + '\n\n' : ''}

Respond concisely and helpfully.`;

    // ============================================================
    // Save user message to conversation
    // ============================================================
    let convId = conversationId;
    if (!convId) {
      const conv = await db.conversation.create({
        data: {
          title: message.substring(0, 50),
          type: 'agent_chat',
          agentId,
          userId: auth.userId,
        },
      });
      convId = (conv as Record<string, unknown>).id as string;
    }

    // ============================================================
    // Call LLM via AI Router
    // ============================================================
    const router = createAIRouter(auth.userId);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: message },
    ];

    const response = await router.chat(messages, { model: 'default' });

    log.info('agent_chat_success', {
      userId: auth.userId,
      agentId,
      model: response.model,
      provider: response.provider,
      tokens: response.usage?.totalTokens,
    });

    // ============================================================
    // Log action (fire-and-forget)
    // ============================================================
    db.agentActionLog.create({
      data: {
        agentId,
        action: 'chat',
        details: JSON.stringify({ message: message.substring(0, 500) }),
        userId: auth.userId,
        status: 'completed',
        result: 'Chat response sent',
        resolvedAt: new Date(),
      },
    }).catch(() => {});

    // Learn from interaction (fire-and-forget)
    learnFromInteraction(agentId, auth.userId, message, response.content).catch(() => {});

    const res = NextResponse.json({
      response: response.content,
      conversationId: convId,
    });
    return secureResponse(res, request);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Failed to process chat';
    log.error('agent_chat_failed', { error: errMsg });
    return NextResponse.json(
      { error: errMsg },
      { status: 500 },
    );
  }
}
