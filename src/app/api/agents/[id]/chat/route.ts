import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, getAllowedOrigins } from '@/lib/security';
import { createAIRouter } from '@/lib/ai-router';
import { getMemoryContext, learnFromInteraction } from '@/lib/agent-memory';
import { checkTokenLimit } from '@/lib/usage-limits';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new Response(null, { status: 204 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 20, windowMs: 60000 },
  });
  if (secError || !auth) return secError || new Response(JSON.stringify({ error: 'Auth required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  try {
    const { id } = await params;
    const body = await request.json();
    const { message, context } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Message length validation
    if (typeof message !== 'string' || message.length > 5000) {
      return new Response(JSON.stringify({ error: 'Message must be at most 5000 characters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Context length validation
    if (context && typeof context === 'string' && context.length > 5000) {
      return new Response(JSON.stringify({ error: 'Context must be at most 5000 characters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const agent = await db.agent.findUnique({
      where: { id },
      include: { permissions: true },
    });

    if (!agent || agent.userId !== auth.userId) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if agent is active
    if (agent.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Agent is not active' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check daily token limit before processing chat
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { plan: true },
    });
    const plan = user?.plan || 'free';
    const tokenCheck = await checkTokenLimit(auth.userId, plan);

    if (!tokenCheck.allowed) {
      return new Response(JSON.stringify({
        error: `Daily token limit reached (${tokenCheck.current.toLocaleString()}/${tokenCheck.limit.toLocaleString()}).`,
        code: 'TOKEN_LIMIT_REACHED',
        current: tokenCheck.current,
        limit: tokenCheck.limit,
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse agent config for personality/instructions
    let agentConfig: Record<string, unknown> = {};
    try {
      agentConfig = JSON.parse(agent.config);
    } catch {
      agentConfig = {};
    }

    const personality = (agentConfig as { personality?: string }).personality || 'helpful and professional';
    const instructions = (agentConfig as { instructions?: string }).instructions || '';

    // Build system prompt based on agent config and permissions
    const grantedPermissions = agent.permissions
      .filter((p) => p.granted)
      .map((p) => p.permission);

    // Retrieve relevant memories for context injection
    const memoryContext = await getMemoryContext(id, auth.userId, message);

    const systemPrompt = `You are ${agent.name}, an AI agent with the following characteristics:
- Type: ${agent.type}
- Personality: ${personality}
${instructions ? `- Special Instructions: ${instructions}` : ''}

Your granted permissions are: ${grantedPermissions.length > 0 ? grantedPermissions.join(', ') : 'none'}

Available tools/permissions:
- browse_web: Navigate and interact with web pages
- social_post: Post on social media platforms
- social_youtube, social_facebook, social_instagram, social_tiktok, social_linkedin: Platform-specific posting
- whatsapp_message: Send WhatsApp messages
- whatsapp_call: Make WhatsApp calls
- use_api: Use external APIs
- use_cpu: Use CPU resources
- use_mvp: Use MVP resources

When a user asks you to do something that requires a permission you don't have, politely inform them that you lack that capability.
When a user asks you to do something that requires approval, let them know it will need approval before execution.

${memoryContext ? memoryContext + '\n\n' : ''}${context ? `Additional context: ${context}` : ''}

Respond concisely and helpfully. If you need to perform an action, describe what you would do.`;

    const router = createAIRouter(auth.userId);

    const messages = [
      {
        role: 'system' as const,
        content: systemPrompt,
      },
      {
        role: 'user' as const,
        content: message,
      },
    ];

    // Create SSE stream using AI router's chatStream
    const encoder = new TextEncoder();
    let fullResponse = ''; // Capture response for learning
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const aiStream = router.chatStream(messages, { model: 'default' });

          for await (const chunk of aiStream) {
            if (chunk.delta) fullResponse += chunk.delta;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

          // Log the chat interaction
          await db.agentActionLog.create({
            data: {
              agentId: id,
              action: 'chat',
              details: JSON.stringify({ message: message.substring(0, 500) }),
              userId: auth.userId,
              status: 'completed',
              result: 'Chat response streamed',
              resolvedAt: new Date(),
            },
          });

          // Learn from this interaction (fire-and-forget)
          learnFromInteraction(id, auth.userId, message, fullResponse).catch(() => {
            // Silently fail — learning is best-effort and shouldn't block the chat
          });
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    const allowedOrigin = getAllowedOrigins(request.headers.get('origin') || undefined);
    const streamHeaders: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (allowedOrigin) {
      streamHeaders['Access-Control-Allow-Origin'] = allowedOrigin;
    }

    return new Response(stream, {
      headers: streamHeaders,
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to process chat' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
