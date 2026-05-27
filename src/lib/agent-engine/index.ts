// Genova Agent Engine Index — Initialize and wire everything together

import { ToolRegistry } from '@/lib/tools/registry';
import { webSearchTool } from '@/lib/tools/web-search';
import { calculatorTool } from '@/lib/tools/calculator';
import { databaseTool } from '@/lib/tools/database';
import { filesystemTool } from '@/lib/tools/filesystem';
import { codeExecutorTool } from '@/lib/tools/code-executor';
import { JobQueue } from '@/lib/queue/job-queue';
import { Tracer } from '@/lib/observability/tracer';
import { RateLimiter } from '@/lib/security/rate-limiter';
import { PromptValidator } from '@/lib/security/prompt-validator';
import { ShortTermMemory } from '@/lib/memory/short-term';
import { LongTermMemory } from '@/lib/memory/long-term';
import { DocumentProcessor } from '@/lib/rag/document-processor';
import { RAGRetriever } from '@/lib/rag/retriever';
import { AgentManager } from '@/lib/agent-engine/agent-manager';
import { executeAgentLoop } from '@/lib/agent-engine/execution-loop';
import { SandboxManager, getSandboxManager } from '@/lib/tools/sandbox';
import { getStreamManager, StreamManager } from '@/lib/streaming';

// Singleton instance
let engineInstance: GenovaEngine | null = null;

export interface GenovaEngine {
  toolRegistry: ToolRegistry;
  jobQueue: JobQueue;
  tracer: Tracer;
  rateLimiter: RateLimiter;
  promptValidator: PromptValidator;
  shortTermMemory: ShortTermMemory;
  longTermMemory: LongTermMemory;
  documentProcessor: DocumentProcessor;
  ragRetriever: RAGRetriever;
  agentManager: AgentManager;
  sandboxManager: SandboxManager;
  streamManager: StreamManager;
}

/**
 * Initialize the Genova Agent Engine with all subsystems
 */
export function initializeAgentEngine(): GenovaEngine {
  if (engineInstance) return engineInstance;

  // Create tool registry with permission layer
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(webSearchTool);
  toolRegistry.register(calculatorTool);
  toolRegistry.register(databaseTool);
  toolRegistry.register(filesystemTool);
  toolRegistry.register(codeExecutorTool);

  // Create job queue
  const jobQueue = new JobQueue(3);

  // Create tracer
  const tracer = new Tracer();

  // Create security
  const rateLimiter = new RateLimiter();
  const promptValidator = new PromptValidator();

  // Create memory
  const shortTermMemory = new ShortTermMemory();
  const longTermMemory = new LongTermMemory();

  // Create RAG
  const documentProcessor = new DocumentProcessor();
  const ragRetriever = new RAGRetriever();

  // Create agent manager
  const agentManager = new AgentManager(toolRegistry);

  // Create sandbox manager
  const sandboxManager = getSandboxManager();

  // Create stream manager
  const streamManager = getStreamManager();

  // Register job handlers
  jobQueue.registerHandler('agent_execution', async (job) => {
    const { agentId, task, userId, conversationId, maxSteps } = job.payload;
    const result = await executeAgentLoop(
      {
        agentId: agentId as string,
        agentName: '',
        agentType: '',
        agentConfig: {},
        task: task as string,
        conversationId: conversationId as string | undefined,
        userId: userId as string,
        maxSteps: (maxSteps as number) || 10,
        maxRetries: 3,
        steps: [],
        status: 'running',
        memory: { shortTerm: [], longTermContext: '' },
        tools: toolRegistry.getToolNames(),
        guardrailsActive: true,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        totalTokensUsed: 0,
        totalCost: 0,
      },
      toolRegistry,
    );
    return result;
  });

  jobQueue.registerHandler('document_processing', async (job) => {
    const { buffer, fileName, mimeType, userId } = job.payload;
    const chunks = await documentProcessor.processFile(
      Buffer.from(buffer as ArrayBuffer),
      fileName as string,
      mimeType as string,
    );
    await ragRetriever.storeChunks(chunks, userId as string);
    return { chunkCount: chunks.length };
  });

  jobQueue.registerHandler('memory_pruning', async (job) => {
    const { userId } = job.payload;
    const result = await longTermMemory.pruneMemories(userId as string);
    return result;
  });

  jobQueue.registerHandler('memory_summarization', async (job) => {
    const { userId, olderThanDays } = job.payload;
    const result = await longTermMemory.summarizeOldMemories(userId as string, {
      olderThanDays: (olderThanDays as number) || 30,
    });
    return result;
  });

  jobQueue.registerHandler('sandbox_execution', async (job) => {
    const { code, language, sandboxId, userId, agentId } = job.payload;
    const result = await sandboxManager.executeCode(
      code as string,
      language as string,
      sandboxId as string,
      { userId: userId as string, agentId: agentId as string }
    );
    return result;
  });

  // Start the job queue
  jobQueue.start();

  // Periodic cleanup (every 5 minutes)
  if (typeof setInterval !== 'undefined') {
    setInterval(() => {
      rateLimiter.cleanup();
      tracer.cleanup();
      sandboxManager.cleanup();
      streamManager.cleanupStaleConnections();
    }, 300000);
  }

  engineInstance = {
    toolRegistry,
    jobQueue,
    tracer,
    rateLimiter,
    promptValidator,
    shortTermMemory,
    longTermMemory,
    documentProcessor,
    ragRetriever,
    agentManager,
    sandboxManager,
    streamManager,
  };

  return engineInstance;
}

/**
 * Get the Genova Engine instance (initializes if needed)
 */
export function getAgentEngine(): GenovaEngine {
  return initializeAgentEngine();
}

// Re-export core types and functions
export { executeAgentLoop } from '@/lib/agent-engine/execution-loop';
export { AgentManager } from '@/lib/agent-engine/agent-manager';
export { decomposeTask } from '@/lib/agent-engine/planner';
export { ToolRegistry } from '@/lib/tools/registry';
export type { ExecutionContext, ExecutionStep, ExecutionPlan, PlanStep, PlanAdaptation } from '@/lib/agent-engine/execution-loop';
export type { MultiAgentPlan } from '@/lib/agent-engine/planner';

// Re-export StateGraph module (LangGraph-style state machine — alternative execution mode)
export {
  StateGraph,
  GraphExecutor,
  StatePersistence,
  createGenovaAgentGraph,
  executeWithStateGraph,
  executionContextToAgentState,
  agentStateToExecutionContext,
} from '@/lib/agent-engine/state-graph';
export type {
  AgentPhase,
  AgentState,
  AgentStateMetadata,
  NodeHandler,
  ConditionFn,
  GraphEdge,
  GraphNode,
  CompiledGraph,
  GraphEventType,
  GraphEvent,
  GraphEventCallback,
  PersistedGraphState,
} from '@/lib/agent-engine/state-graph';
