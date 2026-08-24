// Auto Worker — BullMQ worker pour executions automatiques
// Ameliore: retry, debits, concurrency, gestion d'erreurs, logging structuré

import { Worker, Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { callLLM } from '@/lib/llm/gateway';
import { LLMMessage } from '@/lib/llm/provider';
// P4 — Config worker dynamique par agent (scalabilité roadmap qualité).
import { getWorkerConfig, desiredWorkers } from '@/lib/worker-dynamic-config';
// P2 — Initialisation OpenTelemetry au démarrage du worker (contexte serveur).
import { initTelemetry } from '@/lib/observability/otel-config';
// P0 — Sécurité fail-closed pour le worker
import { enforceSecurity, AgentSecurityBlockError, isRustSafetyAvailable } from '@/lib/security/agent-security-middleware';

// Démarre le SDK OpenTelemetry (si OTEL_ENABLED=1). No-op sinon.
initTelemetry();

const log = createLogger('auto-worker');

// FAIL-CLOSED: vérifier que le moteur Rust est disponible au démarrage du worker
if (!isRustSafetyAvailable() && process.env.NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY !== '1') {
  log.error('auto_worker_rust_not_available', {
    fatal: true,
    hint: 'Le worker auto ne peut PAS démarrer sans le module Rust NAPI compilé.',
  });
  // Ne pas lancer le worker — les jobs resteront en file d'attente
  throw new Error('[FATAL] auto-worker: Rust NAPI safety module not available. Worker will not start. Compile the crate or set NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY=1 for dev only.');
} else {
  log.info('auto_worker_safety_check', { rustAvailable: isRustSafetyAvailable(), jsFallback: process.env.NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY === '1' });
}

const connection = new Redis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null, retryStrategy: (times) => Math.min(times * 100, 3000) }
);

export const agentQueue = new Queue('agent-execution', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600 * 24 },
    removeOnFail: { age: 3600 * 48 },
  },
});

interface AutoJobData {
  agentId: string;
  userId: string;
  input?: string;
  sessionId?: string;
  executionId?: string;
}

// Concurrency globale (bonne pratique BullMQ) : reste prudent ; la config
// dynamique (P4) régule finement par agent via getWorkerConfig().
const BASE_CONCURRENCY = 5;

const autoWorker = new Worker<AutoJobData>('agent-execution', async (job: Job<AutoJobData>) => {
  const { agentId, userId, input, sessionId, executionId } = job.data;

  log.info('auto_worker_processing', { jobId: job.id, agentId, attempt: job.attemptsMade });

  // P4 — Résout la config worker de l'agent (minWorkers/maxWorkers/concurrency/active).
  const wCfg = await getWorkerConfig(agentId);
  if (!wCfg.active) {
    log.warn('auto_agent_worker_disabled', { agentId });
    return; // Agent désactivé via config : on ne traite pas.
  }
  // Estimation de charge souhaitée pour cet agent (utile pour monitorer/scaler).
  const pendingForAgent = (await agentQueue.getJobCounts()).waiting ?? 0;
  const desired = desiredWorkers(wCfg, pendingForAgent);
  log.debug('auto_worker_desired', { agentId, pending: pendingForAgent, desired, cfg: wCfg });

  // Verifier que l'agent existe
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, type: true, userId: true, status: true },
  });

  if (!agent) throw new Error(`Agent ${agentId} introuvable`);
  if (agent.status === 'inactive') {
    log.warn('auto_agent_inactive', { agentId });
    return;
  }

  // Verifier les credits
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { credits: true, plan: true },
  });

  if (!user || (user.credits ?? 0) < 1) {
    log.warn('auto_no_credits', { agentId, userId });
    throw new Error('Credits insuffisants');
  }

  // Creer ou recuperer l'execution
  let execLog;
  if (executionId) {
    execLog = await db.agentExecution.findUnique({ where: { id: executionId } });
  }

  if (!execLog) {
    execLog = await db.agentExecution.create({
      data: {
        agentId, userId,
        input: (input ?? '').slice(0, 500),
        model: 'auto_scheduler',
        status: 'running',
        startedAt: new Date(),
      },
    });
  } else {
    await db.agentExecution.update({
      where: { id: execLog.id },
      data: { status: 'running' },
    });
  }

  const startTime = Date.now();

  try {
    // P0 FAIL-CLOSED: valider le prompt système de l'agent
    const promptToValidate = agent.systemPrompt || `Tu es ${agent.name}, un assistant Gen3ia.`;
    try {
      await enforceSecurity(promptToValidate, {
        agentId,
        userId,
        allowedTools: [],
        source: 'worker_auto',
      });
    } catch (secErr) {
      if (secErr instanceof AgentSecurityBlockError) {
        log.error('auto_worker_prompt_blocked', { agentId, jobId: job.id, reason: secErr.message });
        throw new Error(`Sécurité: ${secErr.message}`);
      }
      throw secErr;
    }

    // Vrai appel LLM via le gateway (au lieu d'un setTimeout + Math.random).
    const messages: LLMMessage[] = [
      { role: 'system', content: promptToValidate },
      { role: 'user', content: `${agent.name} — exécution périodique (${new Date().toISOString()}).` },
    ];

    const llmResult = await callLLM(
      {
        messages,
        model: agent.model || 'gpt-4o-mini',
        maxTokens: agent.maxTokens || 1024,
        temperature: agent.temperature ?? 0.7,
      },
      { tag: 'auto-worker' }
    );

    const duration = Date.now() - startTime;
    const tokenCount = llmResult.tokens || 0;
    const cost = tokenCount * 0.000002;

    await db.agentExecution.update({
      where: { id: execLog.id },
      data: {
        status: 'completed',
        output: JSON.stringify({
          output: llmResult.content,
          tokens: tokenCount,
          duration,
          model: llmResult.model,
          provider: llmResult.provider,
        }),
        totalTokens: tokenCount,
        estimatedCost: cost,
        durationMs: duration,
        completedAt: new Date(),
      },
    });

    // Deduire 1 credit (condition atomique)
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: { credits: { decrement: 1 } },
      select: { credits: true },
    });

    // Logger les metriques de performance
    log.info('auto_worker_completed', {
      jobId: job.id,
      executionId: execLog.id,
      tokens: tokenCount,
      cost,
      duration,
      remainingCredits: updatedUser.credits,
      attempt: job.attemptsMade,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await db.agentExecution.update({
      where: { id: execLog.id },
      data: { status: 'failed', output: JSON.stringify({ error: errMsg }), completedAt: new Date() },
    }).catch(() => {});
    throw error; // BullMQ retry automatique
  }
}, {
  connection,
  concurrency: BASE_CONCURRENCY,
  limiter: { max: 10, duration: 1000 },
});

autoWorker.on('completed', (job: Job) => {
  const duration = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
  log.info('auto_job_completed', { jobId: job.id, duration, queue: 'agent-execution' });
});

autoWorker.on('failed', (job: Job | undefined, error: Error) => {
  log.error('auto_job_failed', {
    jobId: job?.id,
    error: error.message,
    attempts: job?.attemptsMade,
    queue: 'agent-execution',
  });
});

autoWorker.on('error', (error: Error) => {
  log.error('auto_worker_error', { error: error.message });
});

log.info('auto_worker_started', { concurrency: BASE_CONCURRENCY, queue: 'agent-execution' });

export default autoWorker;
