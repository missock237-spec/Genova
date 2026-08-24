// ============================================================
// POST /api/hyperagent — HyperAgent Pipeline
// Architecture à 4 Piliers: Smart Router → Context Optimizer →
//   Parallel Executor → Response Enhancer
// Target: < 750ms total latency
// SECURITE: withAuth() + quota LLM + rate limiting + agent-security-middleware FAIL-CLOSED
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getHyperAgent } from '@/lib/hyperagent';
import { withAuth, type RouteParams } from '@/lib/with-auth';
import { createLogger } from '@/lib/logger';
import { enforceSecurity, AgentSecurityBlockError } from '@/lib/security/agent-security-middleware';

const log = createLogger('hyperagent-api');

export const dynamic = 'force-dynamic';

const MAX_QUERY_LENGTH = 10000;
const MAX_CONTEXT_MESSAGES = 50;

export const POST = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const body = await request.json();
    const { query, context, options } = body;

    // Validate query
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query requise' }, { status: 400 });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({
        error: `Query trop longue (max ${MAX_QUERY_LENGTH} caracteres)`,
      }, { status: 400 });
    }

    // FAIL-CLOSED: valider le query via le middleware de sécurité unifié
    try {
      await enforceSecurity(query, {
        agentId: 'hyperagent',
        userId: auth.userId,
        allowedTools: [],
        source: 'api_hyperagent',
      });
    } catch (secErr) {
      if (secErr instanceof AgentSecurityBlockError) {
        return NextResponse.json({ error: `Securite: ${secErr.message}` }, { status: 403 });
      }
      throw secErr;
    }

    // Validate context
    let validatedContext = context;
    if (context && Array.isArray(context)) {
      if (context.length > MAX_CONTEXT_MESSAGES) {
        return NextResponse.json({
          error: `Trop de messages contextuels (max ${MAX_CONTEXT_MESSAGES})`,
        }, { status: 400 });
      }

      validatedContext = context.map((msg: { role?: string; content?: string }) => ({
        role: msg.role || 'user',
        content: String(msg.content || '').slice(0, 5000),
      }));
    }

    // Validate options
    const validatedOptions = {
      latencyRequirement: ['fast', 'balanced', 'quality'].includes(options?.latencyRequirement)
        ? options.latencyRequirement : 'balanced',
      budgetTokens: typeof options?.budgetTokens === 'number' ? options.budgetTokens : 10000,
      preferredProvider: typeof options?.preferredProvider === 'string' ? options.preferredProvider : undefined,
      enableSpeculative: options?.enableSpeculative !== false,
      enableParallel: options?.enableParallel !== false,
      enableCompression: options?.enableCompression !== false,
      enableEnhancement: options?.enableEnhancement !== false,
      enableFallback: options?.enableFallback !== false,
      maxConcurrency: typeof options?.maxConcurrency === 'number' ? options.maxConcurrency : 4,
    };

    // Process through HyperAgent pipeline
    const hyperAgent = getHyperAgent();
    const result = await hyperAgent.process({
      query,
      userId: auth.userId,
      context: validatedContext,
      options: validatedOptions,
    });

    log.info('hyperagent_success', {
      userId: auth.userId,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
      cached: result.cached,
      speculative: result.speculative,
      confidence: result.confidence,
    });

    return NextResponse.json({
      content: result.content,
      confidence: result.confidence,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
      cached: result.cached,
      speculative: result.speculative,
      enhanced: result.enhanced,
      citations: result.citations,
      explanation: result.explanation,
      verificationStatus: result.verificationStatus,
      metadata: result.metadata,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error('HyperAgent request failed', { error: errMsg });
    return NextResponse.json({
      error: 'Erreur lors du traitement HyperAgent',
      details: process.env.NODE_ENV === 'development' ? errMsg : undefined,
    }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 30, windowMs: 60000 },
  quota: true,
});
