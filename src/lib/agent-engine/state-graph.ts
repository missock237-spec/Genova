// State Graph — LangGraph-style state machine for agent execution
// Provides: State nodes, conditional edges, state transitions, cycle detection
//
// Key concepts:
// 1. StateGraph: A graph of states with transitions between them
// 2. Each node is a function that transforms the state
// 3. Edges can be conditional (based on state)
// 4. The graph supports cycles (for retry/reflect loops)
// 5. State is persistent and can be serialized
//
// States in the agent lifecycle:
// - INIT: Initialize context, load memory, set up tools
// - PLAN: Create or adapt execution plan
// - THINK: Agent reasons about current situation
// - ACT: Execute a tool/action
// - OBSERVE: Process the result of the action
// - REFLECT: Evaluate progress, decide next step
// - CORRECT: Self-correction when something goes wrong
// - RETRY: Retry with corrected approach
// - RESPOND: Generate final response
// - ERROR: Handle unrecoverable errors
// - COMPLETE: Task completed successfully

import { chatCompletion } from '@/lib/ai-router';
import { ToolRegistry } from '@/lib/tools/registry';
import { ShortTermMemory } from '@/lib/memory/short-term';
import { LongTermMemory } from '@/lib/memory/long-term';
import { db } from '@/lib/db';
import { Tracer } from '@/lib/observability/tracer';
import {
  type ExecutionContext,
  type ExecutionStep,
  type ExecutionPlan,
  type PlanStep,
  type PlanAdaptation,
} from '@/lib/agent-engine/execution-loop';

// ============================================================
// AGENT PHASE — The nodes in the state graph
// ============================================================

export type AgentPhase =
  | 'INIT'
  | 'PLAN'
  | 'THINK'
  | 'ACT'
  | 'OBSERVE'
  | 'REFLECT'
  | 'CORRECT'
  | 'RETRY'
  | 'RESPOND'
  | 'ERROR'
  | 'COMPLETE';

// ============================================================
// AGENT STATE — The state object that flows through the graph
// ============================================================

export interface AgentStateMetadata {
  tokensUsed: number;
  estimatedCost: number;
  durationMs: number;
  modelUsed: string;
  providerUsed: string;
}

export interface AgentState {
  // Identity
  agentId: string;
  agentName: string;
  agentType: string;
  agentConfig: Record<string, unknown>;
  task: string;
  conversationId?: string;
  userId: string;

  // Phase tracking
  currentPhase: AgentPhase;
  previousPhase: AgentPhase | null;
  phaseHistory: Array<{ phase: AgentPhase; enteredAt: string; exitedAt?: string }>;

  // Execution
  steps: ExecutionStep[];
  maxSteps: number;
  maxRetries: number;
  retryCount: number;

  // Memory
  memory: {
    shortTerm: Array<{ role: string; content: string }>;
    longTermContext: string;
  };

  // Tools
  tools: string[];
  guardrailsActive: boolean;

  // Plan
  plan?: ExecutionPlan;

  // Confidence & evaluation
  confidence: number;
  progressScore: number;

  // Error tracking
  errorInfo: string | null;
  consecutiveErrors: number;

  // Metadata
  metadata: AgentStateMetadata;

  // Execution control
  status: 'running' | 'completed' | 'failed' | 'paused' | 'awaiting_approval' | 'reflecting' | 'retrying';
  startedAt: string;
  lastUpdatedAt: string;

  // Graph-specific
  iterationCount: number;
  maxIterations: number;

  // Streaming
  streamConnectionId?: string;

  // Pending action (set by THINK, consumed by ACT)
  pendingAction?: {
    toolName: string;
    toolInput: Record<string, unknown>;
    isFinal: boolean;
  };

  // Last observation (set by OBSERVE, consumed by REFLECT)
  lastObservation?: ExecutionStep;

  // Reflection result (set by REFLECT, consumed by CORRECT or next THINK)
  reflectionResult?: {
    progressScore: number;
    qualityScore: number;
    needsRetry: boolean;
    needsAdaptation: boolean;
    reflection: string;
    recommendation: 'continuer' | 'retry' | 'adapt' | 'stop' | 'respond';
    alternativeApproach?: string;
    confidenceInResult: number;
  };

  // Correction result (set by CORRECT, consumed by RETRY)
  correctionResult?: {
    analysis: string;
    correctedAction: string;
    correctedInput: Record<string, unknown>;
    isFinal: boolean;
    confidence: number;
  };

  // Final response
  finalResponse?: string;
}

// ============================================================
// GRAPH TYPES — Edge, Node, Condition
// ============================================================

export type NodeHandler = (state: AgentState, toolRegistry: ToolRegistry) => Promise<AgentState>;

export type ConditionFn = (state: AgentState) => string;

export interface GraphEdge {
  from: string;
  to: string;
  condition?: ConditionFn;
  conditionMap?: Record<string, string>;
}

export interface GraphNode {
  name: string;
  handler: NodeHandler;
}

export interface CompiledGraph {
  nodes: Map<string, NodeHandler>;
  edges: Map<string, GraphEdge[]>;
  entryPoint: string;
  finishPoints: Set<string>;
}

// ============================================================
// GRAPH EXECUTION EVENT — For streaming / observability
// ============================================================

export type GraphEventType =
  | 'node_enter'
  | 'node_exit'
  | 'node_error'
  | 'edge_traverse'
  | 'cycle_detected'
  | 'graph_complete'
  | 'graph_error'
  | 'state_snapshot';

export interface GraphEvent {
  type: GraphEventType;
  nodeName: string;
  state: AgentState;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type GraphEventCallback = (event: GraphEvent) => void;

// ============================================================
// CYCLE DETECTION — Prevent infinite loops
// ============================================================

class CycleDetector {
  private visitCounts: Map<string, number> = new Map();
  private readonly maxNodeVisits: number;
  private readonly maxTotalIterations: number;
  private totalIterations: number = 0;

  constructor(maxNodeVisits: number = 5, maxTotalIterations: number = 50) {
    this.maxNodeVisits = maxNodeVisits;
    this.maxTotalIterations = maxTotalIterations;
  }

  /**
   * Record a visit to a node and check if it exceeds the threshold
   */
  checkAndRecord(nodeName: string): { allowed: boolean; reason?: string } {
    this.totalIterations++;

    if (this.totalIterations > this.maxTotalIterations) {
      return {
        allowed: false,
        reason: `Maximum total iterations reached (${this.maxTotalIterations}). Possible infinite loop detected.`,
      };
    }

    const currentCount = this.visitCounts.get(nodeName) || 0;
    const newCount = currentCount + 1;
    this.visitCounts.set(nodeName, newCount);

    // Allow more visits for THINK and REFLECT since they naturally loop
    const threshold = ['THINK', 'REFLECT', 'OBSERVE'].includes(nodeName)
      ? this.maxNodeVisits * 2
      : this.maxNodeVisits;

    if (newCount > threshold) {
      return {
        allowed: false,
        reason: `Node "${nodeName}" visited ${newCount} times (max: ${threshold}). Possible infinite loop detected.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get the visit count for a node
   */
  getVisitCount(nodeName: string): number {
    return this.visitCounts.get(nodeName) || 0;
  }

  /**
   * Reset the cycle detector
   */
  reset(): void {
    this.visitCounts.clear();
    this.totalIterations = 0;
  }

  /**
   * Get a summary of visit counts
   */
  getSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const [key, value] of this.visitCounts.entries()) {
      summary[key] = value;
    }
    return summary;
  }
}

// ============================================================
// STATE PERSISTENCE — Save and resume graph execution
// ============================================================

export interface PersistedGraphState {
  id: string;
  state: AgentState;
  currentNode: string;
  cycleDetectorSummary: Record<string, number>;
  savedAt: string;
  version: string;
}

export class StatePersistence {
  /**
   * Save the current graph state for later resumption
   */
  static async save(
    state: AgentState,
    currentNode: string,
    cycleSummary: Record<string, number>
  ): Promise<string> {
    const id = state.executionId || `graph_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const persisted: PersistedGraphState = {
      id,
      state,
      currentNode,
      cycleDetectorSummary: cycleSummary,
      savedAt: new Date().toISOString(),
      version: '1.0.0',
    };

    try {
      await db.agentExecution.upsert({
        where: { id },
        create: {
          id,
          agentId: state.agentId,
          task: state.task,
          steps: JSON.stringify(persisted),
          status: 'paused',
          totalDuration: state.metadata.durationMs,
          totalTokens: state.metadata.tokensUsed,
          estimatedCost: state.metadata.estimatedCost,
          model: state.metadata.modelUsed || 'auto-routed',
          provider: state.metadata.providerUsed || 'state-graph',
          userId: state.userId,
          conversationId: state.conversationId,
        },
        update: {
          steps: JSON.stringify(persisted),
          status: 'paused',
          totalDuration: state.metadata.durationMs,
          totalTokens: state.metadata.tokensUsed,
          estimatedCost: state.metadata.estimatedCost,
        },
      });
    } catch {
      // Fail silently — persistence is best-effort
    }

    return id;
  }

  /**
   * Load a previously saved graph state
   */
  static async load(persistenceId: string): Promise<{ state: AgentState; currentNode: string; cycleSummary: Record<string, number> } | null> {
    try {
      const execution = await db.agentExecution.findUnique({
        where: { id: persistenceId },
      });

      if (!execution || execution.status !== 'paused') return null;

      const persisted: PersistedGraphState = JSON.parse(execution.steps as string || '{}');
      if (!persisted.state) return null;

      return {
        state: persisted.state,
        currentNode: persisted.currentNode,
        cycleSummary: persisted.cycleDetectorSummary,
      };
    } catch {
      return null;
    }
  }
}

// ============================================================
// STATE GRAPH — The core graph builder
// ============================================================

export class StateGraph {
  private nodes: Map<string, NodeHandler> = new Map();
  private edges: Map<string, GraphEdge[]> = new Map();
  private entryPoint: string | null = null;
  private finishPoints: Set<string> = new Set();
  private eventCallbacks: GraphEventCallback[] = [];

  /**
   * Add a state node with a handler function
   */
  addNode(name: string, handler: NodeHandler): this {
    if (this.nodes.has(name)) {
      throw new Error(`Node "${name}" already exists in the graph`);
    }
    this.nodes.set(name, handler);
    return this;
  }

  /**
   * Add an unconditional transition edge
   */
  addEdge(from: string, to: string): this {
    if (!this.nodes.has(from)) {
      throw new Error(`Source node "${from}" does not exist`);
    }
    if (!this.nodes.has(to)) {
      throw new Error(`Target node "${to}" does not exist`);
    }

    const existing = this.edges.get(from) || [];
    existing.push({ from, to });
    this.edges.set(from, existing);
    return this;
  }

  /**
   * Add a conditional branching edge
   * The conditionFn returns a string key that maps to a target node via the edges map
   */
  addConditionalEdge(from: string, conditionFn: ConditionFn, edges: Record<string, string>): this {
    if (!this.nodes.has(from)) {
      throw new Error(`Source node "${from}" does not exist`);
    }

    // Validate that all edge targets exist
    for (const [key, target] of Object.entries(edges)) {
      if (!this.nodes.has(target)) {
        throw new Error(`Conditional edge target "${target}" for key "${key}" does not exist`);
      }
    }

    const existing = this.edges.get(from) || [];
    existing.push({ from, to: '__conditional__', condition: conditionFn, conditionMap: edges });
    this.edges.set(from, existing);
    return this;
  }

  /**
   * Set the initial / entry node
   */
  setEntryPoint(nodeName: string): this {
    if (!this.nodes.has(nodeName)) {
      throw new Error(`Entry point node "${nodeName}" does not exist`);
    }
    this.entryPoint = nodeName;
    return this;
  }

  /**
   * Set a terminal / finish node
   */
  setFinishPoint(nodeName: string): this {
    if (!this.nodes.has(nodeName)) {
      throw new Error(`Finish point node "${nodeName}" does not exist`);
    }
    this.finishPoints.add(nodeName);
    return this;
  }

  /**
   * Register an event callback for streaming / observability
   */
  onEvent(callback: GraphEventCallback): this {
    this.eventCallbacks.push(callback);
    return this;
  }

  /**
   * Compile the graph into an executable form
   */
  compile(): CompiledGraph {
    if (!this.entryPoint) {
      throw new Error('Graph must have an entry point. Call setEntryPoint() before compile().');
    }

    if (this.finishPoints.size === 0) {
      throw new Error('Graph must have at least one finish point. Call setFinishPoint() before compile().');
    }

    // Validate that all nodes with edges have at least one outgoing edge
    for (const [nodeName] of this.nodes) {
      if (!this.finishPoints.has(nodeName) && !this.edges.has(nodeName)) {
        throw new Error(`Non-terminal node "${nodeName}" has no outgoing edges. Add an edge or make it a finish point.`);
      }
    }

    return {
      nodes: new Map(this.nodes),
      edges: new Map(this.edges),
      entryPoint: this.entryPoint,
      finishPoints: new Set(this.finishPoints),
    };
  }

  /**
   * Get the event callbacks (used by executor)
   */
  getEventCallbacks(): GraphEventCallback[] {
    return [...this.eventCallbacks];
  }

  /**
   * Get a visual representation of the graph (for debugging / UI)
   */
  toDot(): string {
    let dot = 'digraph StateGraph {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box, style=filled, fillcolor=lightyellow];\n\n';

    // Entry point
    if (this.entryPoint) {
      dot += `  ENTRY [shape=circle, fillcolor=green, label=""];\n`;
      dot += `  ENTRY -> ${this.entryPoint};\n\n`;
    }

    // Nodes
    for (const [name] of this.nodes) {
      const isFinish = this.finishPoints.has(name);
      const shape = isFinish ? 'doubleoctagon, fillcolor=lightcoral' : 'box, fillcolor=lightyellow';
      dot += `  ${name} [shape=${shape}];\n`;
    }
    dot += '\n';

    // Edges
    for (const [, edgeList] of this.edges) {
      for (const edge of edgeList) {
        if (edge.condition && edge.conditionMap) {
          for (const [conditionKey, target] of Object.entries(edge.conditionMap)) {
            dot += `  ${edge.from} -> ${target} [label="${conditionKey}", style=dashed];\n`;
          }
        } else {
          dot += `  ${edge.from} -> ${edge.to};\n`;
        }
      }
    }

    dot += '}\n';
    return dot;
  }
}

// ============================================================
// GRAPH EXECUTOR — Runs a compiled graph
// ============================================================

export class GraphExecutor {
  private compiled: CompiledGraph;
  private cycleDetector: CycleDetector;
  private tracer: Tracer;
  private eventCallbacks: GraphEventCallback[];
  private persistenceEnabled: boolean;
  private persistenceInterval: number;
  private lastPersistenceTime: number = 0;

  constructor(
    compiled: CompiledGraph,
    eventCallbacks: GraphEventCallback[] = [],
    options?: {
      maxNodeVisits?: number;
      maxTotalIterations?: number;
      persistenceEnabled?: boolean;
      persistenceIntervalMs?: number;
    }
  ) {
    this.compiled = compiled;
    this.cycleDetector = new CycleDetector(
      options?.maxNodeVisits ?? 5,
      options?.maxTotalIterations ?? 50
    );
    this.tracer = new Tracer();
    this.eventCallbacks = [...eventCallbacks];
    this.persistenceEnabled = options?.persistenceEnabled ?? false;
    this.persistenceInterval = options?.persistenceIntervalMs ?? 10000;
  }

  /**
   * Execute the compiled graph from an initial state
   */
  async execute(
    initialState: AgentState,
    toolRegistry: ToolRegistry
  ): Promise<AgentState> {
    let state = { ...initialState };
    let currentNode = this.compiled.entryPoint;

    const traceId = this.tracer.startTrace(state.agentId, state.task);

    // Ensure initial state is properly set
    state.currentPhase = currentNode as AgentPhase;
    state.status = 'running';
    state.startedAt = state.startedAt || new Date().toISOString();
    state.lastUpdatedAt = new Date().toISOString();
    state.iterationCount = 0;
    state.phaseHistory = state.phaseHistory || [];

    // Emit initial state snapshot
    this.emitEvent({
      type: 'state_snapshot',
      nodeName: currentNode,
      state,
      timestamp: new Date().toISOString(),
      metadata: { traceId },
    });

    // Main execution loop
    while (currentNode && !this.compiled.finishPoints.has(currentNode)) {
      // Cycle detection
      const cycleCheck = this.cycleDetector.checkAndRecord(currentNode);
      if (!cycleCheck.allowed) {
        this.emitEvent({
          type: 'cycle_detected',
          nodeName: currentNode,
          state,
          timestamp: new Date().toISOString(),
          metadata: { reason: cycleCheck.reason },
        });

        state.errorInfo = cycleCheck.reason || 'Cycle detected';
        state.status = 'failed';
        state.currentPhase = 'ERROR';

        // Execute ERROR node if it exists
        const errorHandler = this.compiled.nodes.get('ERROR');
        if (errorHandler) {
          state = await errorHandler(state, toolRegistry);
        }
        break;
      }

      state.iterationCount++;

      // Emit node enter event
      this.emitEvent({
        type: 'node_enter',
        nodeName: currentNode,
        state,
        timestamp: new Date().toISOString(),
        metadata: { iteration: state.iterationCount },
      });

      // Record phase history
      const previousPhase = state.currentPhase;
      state.previousPhase = previousPhase;
      state.currentPhase = currentNode as AgentPhase;
      state.phaseHistory.push({
        phase: currentNode as AgentPhase,
        enteredAt: new Date().toISOString(),
      });

      // Execute the node handler
      const handler = this.compiled.nodes.get(currentNode);
      if (!handler) {
        state.errorInfo = `No handler found for node "${currentNode}"`;
        state.status = 'failed';
        break;
      }

      try {
        const nodeStartTime = Date.now();
        state = await handler(state, toolRegistry);
        const nodeDuration = Date.now() - nodeStartTime;
        state.metadata.durationMs += nodeDuration;
        state.lastUpdatedAt = new Date().toISOString();

        // Update phase exit time
        const lastPhaseEntry = state.phaseHistory[state.phaseHistory.length - 1];
        if (lastPhaseEntry) {
          lastPhaseEntry.exitedAt = new Date().toISOString();
        }

        // Emit node exit event
        this.emitEvent({
          type: 'node_exit',
          nodeName: currentNode,
          state,
          timestamp: new Date().toISOString(),
          metadata: { duration: nodeDuration },
        });

        // Trace the step
        this.tracer.addStep(traceId, {
          type: currentNode,
          content: `Phase: ${currentNode}`,
          duration: nodeDuration,
          tokensUsed: state.metadata.tokensUsed,
          model: state.metadata.modelUsed,
          provider: state.metadata.providerUsed,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.emitEvent({
          type: 'node_error',
          nodeName: currentNode,
          state,
          timestamp: new Date().toISOString(),
          metadata: { error: errorMessage },
        });

        state.errorInfo = `Error in node "${currentNode}": ${errorMessage}`;
        state.consecutiveErrors++;

        // If we have an ERROR node, redirect to it
        if (this.compiled.nodes.has('ERROR')) {
          currentNode = 'ERROR';
          continue;
        } else {
          state.status = 'failed';
          break;
        }
      }

      // Periodic state persistence
      if (this.persistenceEnabled) {
        const now = Date.now();
        if (now - this.lastPersistenceTime > this.persistenceInterval) {
          await StatePersistence.save(state, currentNode, this.cycleDetector.getSummary());
          this.lastPersistenceTime = now;
        }
      }

      // Determine the next node
      const nextNode = this.resolveNextNode(currentNode, state);
      if (!nextNode) {
        state.errorInfo = `No outgoing edge from node "${currentNode}" for current state`;
        state.status = 'failed';
        break;
      }

      // Emit edge traversal event
      this.emitEvent({
        type: 'edge_traverse',
        nodeName: currentNode,
        state,
        timestamp: new Date().toISOString(),
        metadata: { from: currentNode, to: nextNode },
      });

      currentNode = nextNode;

      // Check if we should stop early
      if (['completed', 'failed', 'paused', 'awaiting_approval'].includes(state.status)) {
        break;
      }
    }

    // If we reached a finish point, mark it
    if (this.compiled.finishPoints.has(currentNode)) {
      const finishHandler = this.compiled.nodes.get(currentNode);
      if (finishHandler) {
        state = await finishHandler(state, toolRegistry);
      }
    }

    // End trace
    this.tracer.endTrace(traceId, state.status === 'completed' ? 'completed' : 'failed');

    // Final event
    this.emitEvent({
      type: 'graph_complete',
      nodeName: currentNode,
      state,
      timestamp: new Date().toISOString(),
      metadata: {
        totalIterations: state.iterationCount,
        totalDuration: state.metadata.durationMs,
        cycleDetectorSummary: this.cycleDetector.getSummary(),
      },
    });

    return state;
  }

  /**
   * Resume a previously saved graph execution
   */
  async resume(
    persistenceId: string,
    toolRegistry: ToolRegistry
  ): Promise<AgentState | null> {
    const loaded = await StatePersistence.load(persistenceId);
    if (!loaded) return null;

    // Restore cycle detector state
    for (const [node, count] of Object.entries(loaded.cycleSummary)) {
      // Reconstruct cycle detector with restored counts
      for (let i = 0; i < count; i++) {
        this.cycleDetector.checkAndRecord(node);
      }
    }

    const state = loaded.state;
    state.status = 'running';
    state.lastUpdatedAt = new Date().toISOString();

    // Find the next node from the current node
    const currentNode = loaded.currentNode;
    const nextNode = this.resolveNextNode(currentNode, state);
    if (!nextNode) return state;

    // Create a modified executor that starts from the saved node
    const modifiedCompiled = { ...this.compiled, entryPoint: nextNode };
    const executor = new GraphExecutor(modifiedCompiled, this.eventCallbacks, {
      persistenceEnabled: this.persistenceEnabled,
      persistenceIntervalMs: this.persistenceInterval,
    });

    return executor.execute(state, toolRegistry);
  }

  /**
   * Resolve the next node from the current node using edges and conditions
   */
  private resolveNextNode(currentNode: string, state: AgentState): string | null {
    const outgoingEdges = this.compiled.edges.get(currentNode);
    if (!outgoingEdges || outgoingEdges.length === 0) {
      // If this is a finish point, return null (we're done)
      if (this.compiled.finishPoints.has(currentNode)) {
        return null;
      }
      return null;
    }

    for (const edge of outgoingEdges) {
      if (edge.condition && edge.conditionMap) {
        // Conditional edge
        const conditionResult = edge.condition(state);
        const targetNode = edge.conditionMap[conditionResult];
        if (targetNode) {
          return targetNode;
        }
      } else {
        // Unconditional edge
        return edge.to;
      }
    }

    return null;
  }

  /**
   * Emit an event to all registered callbacks
   */
  private emitEvent(event: GraphEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch {
        // Don't let event callback errors break execution
      }
    }
  }
}

// ============================================================
// STEP ID GENERATOR
// ============================================================

let stateGraphStepCounter = 0;

function generateGraphStepId(): string {
  return `sg_step_${Date.now()}_${++stateGraphStepCounter}`;
}

// ============================================================
// NODE HANDLERS — Default Genova agent node implementations
// ============================================================

/**
 * INIT node — Initialize context, load memory, set up tools
 */
async function initNode(state: AgentState, toolRegistry: ToolRegistry): Promise<AgentState> {
  const startTime = Date.now();

  // Load agent config from database if needed
  if (!state.agentConfig || Object.keys(state.agentConfig).length === 0) {
    try {
      const agent = await db.agent.findUnique({
        where: { id: state.agentId },
      });
      if (agent) {
        state.agentName = agent.name;
        state.agentType = agent.type;
        try {
          state.agentConfig = JSON.parse(agent.config);
        } catch {
          state.agentConfig = {};
        }
      }
    } catch {
      // Database lookup failed, continue with defaults
    }
  }

  // Load long-term memory context
  try {
    const longTermMemory = new LongTermMemory();
    const knowledgeContext = await longTermMemory.getContextForQuery(state.task, state.userId);
    state.memory.longTermContext = knowledgeContext;
  } catch {
    state.memory.longTermContext = '';
  }

  // Load short-term memory from conversation if available
  if (state.conversationId) {
    try {
      const shortTermMemory = new ShortTermMemory();
      const conversationContext = await shortTermMemory.getContext(state.conversationId, 10);
      state.memory.shortTerm = conversationContext;
    } catch {
      state.memory.shortTerm = state.memory.shortTerm || [];
    }
  }

  // Create initial plan if no plan exists
  if (!state.plan) {
    state.plan = await createGraphExecutionPlan(state);
  }

  // Record initialization step
  const initStep: ExecutionStep = {
    id: generateGraphStepId(),
    type: 'plan',
    content: `Agent ${state.agentName} initialized for task: ${state.task}`,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    confidence: 1.0,
  };
  state.steps.push(initStep);

  state.metadata.durationMs += Date.now() - startTime;
  state.lastUpdatedAt = new Date().toISOString();

  return state;
}

/**
 * PLAN node — Create or adapt execution plan
 */
async function planNode(state: AgentState, _toolRegistry: ToolRegistry): Promise<AgentState> {
  const startTime = Date.now();

  if (!state.plan) {
    state.plan = await createGraphExecutionPlan(state);
  } else {
    // Advance the plan
    const currentStep = state.plan.steps[state.plan.currentStepIndex];
    if (currentStep && currentStep.status === 'completed') {
      state.plan.currentStepIndex++;
      if (state.plan.currentStepIndex < state.plan.steps.length) {
        state.plan.steps[state.plan.currentStepIndex].status = 'in_progress';
      }
    } else if (currentStep && currentStep.status === 'pending') {
      currentStep.status = 'in_progress';
    }
  }

  const planStep: ExecutionStep = {
    id: generateGraphStepId(),
    type: 'plan',
    content: state.plan
      ? `Plan: étape ${state.plan.currentStepIndex + 1}/${state.plan.steps.length} — ${state.plan.steps[state.plan.currentStepIndex]?.description || 'Terminé'}`
      : 'Aucun plan disponible',
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
  };
  state.steps.push(planStep);

  state.metadata.durationMs += Date.now() - startTime;
  state.lastUpdatedAt = new Date().toISOString();

  return state;
}

/**
 * THINK node — Agent reasons about the current situation
 */
async function thinkNode(state: AgentState, toolRegistry: ToolRegistry): Promise<AgentState> {
  const startTime = Date.now();

  try {
    const systemPrompt = buildGraphThinkPrompt(state, toolRegistry);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...state.memory.shortTerm.slice(-8),
      { role: 'user' as const, content: 'Analyse la situation actuelle. Quelle est ta prochaine action ? Réponds en JSON.' },
    ];

    const result = await chatCompletion(messages, 'reasoning');

    let parsed: {
      thought: string;
      action: string;
      actionInput: Record<string, unknown>;
      isFinal: boolean;
      confidence: number;
    };

    try {
      let content = result.content.trim();
      content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        thought: result.content,
        action: 'respond',
        actionInput: { message: result.content },
        isFinal: true,
        confidence: 0.5,
      };
    }

    const thinkStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'thought',
      content: parsed.thought || 'Analyse en cours...',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: parsed.confidence || 0.5,
    };
    state.steps.push(thinkStep);
    state.memory.shortTerm.push({ role: 'assistant', content: parsed.thought });

    state.metadata.tokensUsed += Math.ceil(result.content.length / 4);
    state.metadata.modelUsed = result.model;
    state.metadata.providerUsed = result.provider;
    state.confidence = parsed.confidence || 0.5;

    // Set the pending action for the ACT node
    state.pendingAction = {
      toolName: parsed.action,
      toolInput: parsed.actionInput || {},
      isFinal: parsed.isFinal || parsed.action === 'respond',
    };

    // If this is a final response, set the finalResponse
    if (parsed.isFinal || parsed.action === 'respond') {
      state.finalResponse = (parsed.actionInput?.message as string) || parsed.thought || 'Tâche terminée';

      const resultStep: ExecutionStep = {
        id: generateGraphStepId(),
        type: 'result',
        content: state.finalResponse,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        confidence: parsed.confidence,
      };
      state.steps.push(resultStep);
    }
  } catch (error) {
    const errorStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'error',
      content: `Erreur de raisonnement: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: 0,
    };
    state.steps.push(errorStep);
    state.consecutiveErrors++;
    state.errorInfo = errorStep.content;
  }

  state.metadata.durationMs += Date.now() - startTime;
  state.lastUpdatedAt = new Date().toISOString();

  return state;
}

/**
 * ACT node — Execute a tool/action
 */
async function actNode(state: AgentState, toolRegistry: ToolRegistry): Promise<AgentState> {
  const startTime = Date.now();

  if (!state.pendingAction) {
    const errorStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'error',
      content: 'Aucune action en attente — le nœud THINK doit précéder ACT',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: 0,
      needsRetry: true,
    };
    state.steps.push(errorStep);
    state.consecutiveErrors++;
    state.errorInfo = errorStep.content;
    state.metadata.durationMs += Date.now() - startTime;
    return state;
  }

  const { toolName, toolInput, isFinal } = state.pendingAction;

  // If this is a final response, we don't need to execute a tool
  if (isFinal || toolName === 'respond') {
    state.metadata.durationMs += Date.now() - startTime;
    // Clear pending action
    state.pendingAction = undefined;
    return state;
  }

  // Record the action step
  const actionStep: ExecutionStep = {
    id: generateGraphStepId(),
    type: 'action',
    content: `Exécution de l'outil ${toolName}`,
    toolName,
    toolInput,
    timestamp: new Date().toISOString(),
  };
  state.steps.push(actionStep);

  // Check if the tool exists
  const tool = toolRegistry.get(toolName);
  if (!tool) {
    const errorStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'error',
      content: `Outil "${toolName}" non trouvé. Outils disponibles: ${state.tools.join(', ')}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: 0,
      needsRetry: true,
      alternativeApproach: 'Essayer un outil différent ou reformuler la demande',
    };
    state.steps.push(errorStep);
    state.consecutiveErrors++;
    state.errorInfo = errorStep.content;
    state.pendingAction = undefined;
    state.metadata.durationMs += Date.now() - startTime;
    return state;
  }

  // Check guardrails for dangerous tools
  if (tool.isDangerous && state.guardrailsActive) {
    try {
      const guardrails = await db.guardrail.findMany({
        where: { userId: state.userId, isActive: true },
      });

      if (guardrails.length > 0) {
        const blockingGuardrail = guardrails.find(g => {
          try {
            const rules = JSON.parse(g.rules);
            return rules.blockDangerousTools === true || rules.blockTools?.includes(toolName);
          } catch {
            return false;
          }
        });

        if (blockingGuardrail) {
          const obsStep: ExecutionStep = {
            id: generateGraphStepId(),
            type: 'observation',
            content: `Action bloquée par le garde-fou "${blockingGuardrail.name}". Approbation requise.`,
            toolName,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
            confidence: 0.3,
            needsRetry: true,
            alternativeApproach: 'Demander l\'approbation de l\'utilisateur ou utiliser un outil alternatif non dangereux',
          };
          state.steps.push(obsStep);
          state.lastObservation = obsStep;
          state.status = 'awaiting_approval';
          state.pendingAction = undefined;
          state.metadata.durationMs += Date.now() - startTime;
          return state;
        }
      }
    } catch {
      // Guardrail check failed, continue anyway
    }
  }

  // Execute the tool
  try {
    const result = await toolRegistry.execute(toolName, toolInput, {
      userId: state.userId,
      agentId: state.agentId,
      conversationId: state.conversationId,
      sandbox: true,
    });

    const duration = Date.now() - startTime;

    if (result.success) {
      const outputStr = typeof result.result === 'string'
        ? result.result
        : JSON.stringify(result.result, null, 2);

      const obsStep: ExecutionStep = {
        id: generateGraphStepId(),
        type: 'observation',
        content: outputStr.length > 2000 ? outputStr.substring(0, 2000) + '... [tronqué]' : outputStr,
        toolName,
        toolOutput: result.result,
        timestamp: new Date().toISOString(),
        duration,
        confidence: 0.8,
      };
      state.steps.push(obsStep);
      state.memory.shortTerm.push({
        role: 'user',
        content: `Résultat de ${toolName}: ${obsStep.content}`,
      });
      state.lastObservation = obsStep;
      state.consecutiveErrors = 0;
    } else {
      const errorStep: ExecutionStep = {
        id: generateGraphStepId(),
        type: 'error',
        content: `Erreur de l'outil ${toolName}: ${result.error}`,
        toolName,
        timestamp: new Date().toISOString(),
        duration,
        confidence: 0.1,
        needsRetry: true,
        alternativeApproach: `L'outil ${toolName} a échoué. Essayer une approche différente.`,
      };
      state.steps.push(errorStep);
      state.lastObservation = errorStep;
      state.consecutiveErrors++;
      state.errorInfo = errorStep.content;
    }
  } catch (error) {
    const errorStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'error',
      content: `Erreur d'exécution de l'outil ${toolName}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      toolName,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: 0,
      needsRetry: true,
    };
    state.steps.push(errorStep);
    state.lastObservation = errorStep;
    state.consecutiveErrors++;
    state.errorInfo = errorStep.content;
  }

  // Clear pending action
  state.pendingAction = undefined;
  state.metadata.durationMs += Date.now() - startTime;
  state.lastUpdatedAt = new Date().toISOString();

  return state;
}

/**
 * OBSERVE node — Process the result of the action
 */
async function observeNode(state: AgentState, _toolRegistry: ToolRegistry): Promise<AgentState> {
  const startTime = Date.now();

  // The observation step has already been created in the ACT node
  // Here we process and format it for reflection
  if (state.lastObservation) {
    const observeStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'observation',
      content: `Observation traitée: ${state.lastObservation.content.substring(0, 500)}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: state.lastObservation.confidence,
    };
    state.steps.push(observeStep);

    // Update progress score based on observation confidence
    if (state.lastObservation.confidence) {
      state.progressScore = state.progressScore * 0.6 + state.lastObservation.confidence * 0.4;
    }
  } else {
    const observeStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'observation',
      content: 'Aucune observation disponible — rien à observer',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: 0.3,
    };
    state.steps.push(observeStep);
  }

  state.metadata.durationMs += Date.now() - startTime;
  state.lastUpdatedAt = new Date().toISOString();

  return state;
}

/**
 * REFLECT node — Evaluate progress, decide next step
 */
async function reflectNode(state: AgentState, _toolRegistry: ToolRegistry): Promise<AgentState> {
  const startTime = Date.now();
  state.status = 'reflecting';

  try {
    const recentSteps = state.steps.slice(-5);
    const stepSummary = recentSteps.map(s => {
      switch (s.type) {
        case 'thought': return `💭 Pensée: ${s.content}`;
        case 'action': return `🔧 Action: ${s.toolName}(${JSON.stringify(s.toolInput || {})})`;
        case 'observation': return `👁️ Observation: ${s.content.substring(0, 500)}`;
        case 'error': return `❌ Erreur: ${s.content}`;
        case 'reflection': return `🪞 Réflexion: ${s.content}`;
        case 'correction': return `🔄 Correction: ${s.content}`;
        default: return s.content;
      }
    }).join('\n');

    const lastObs = state.lastObservation?.content || 'Aucune observation récente';

    const reflectPrompt = `Tu es le système de réflexion de ${state.agentName}. Évalue la progression de l'agent vers son objectif.

## Objectif
${state.task}

## Dernière observation
${lastObs.substring(0, 1000)}

## Étapes récentes
${stepSummary}

## Statut
- Itération: ${state.iterationCount}/${state.maxIterations}
- Confiance: ${state.confidence.toFixed(2)}
- Erreurs consécutives: ${state.consecutiveErrors}
- Tentatives de correction: ${state.retryCount}/${state.maxRetries}

## Évalue ce qui suit
1. La progression vers l'objectif (0-1)
2. La qualité du résultat de la dernière action
3. S'il faut réessayer différemment
4. S'il faut adapter le plan
5. S'il faut changer d'approche

Réponds UNIQUEMENT en JSON:
{
  "progressScore": 0.0 à 1.0,
  "qualityScore": 0.0 à 1.0,
  "needsRetry": true/false,
  "needsAdaptation": true/false,
  "reflection": "Analyse de la progression et recommandation",
  "recommendation": "continuer | retry | adapt | stop | respond",
  "alternativeApproach": "Description d'une approche alternative si retry ou adapt",
  "confidenceInResult": 0.0 à 1.0
}`;

    const result = await chatCompletion([
      { role: 'system', content: reflectPrompt },
      { role: 'user', content: 'Évalue la progression actuelle.' },
    ], 'reasoning');

    let parsed: {
      progressScore: number;
      qualityScore: number;
      needsRetry: boolean;
      needsAdaptation: boolean;
      reflection: string;
      recommendation: 'continuer' | 'retry' | 'adapt' | 'stop' | 'respond';
      alternativeApproach?: string;
      confidenceInResult: number;
    };

    try {
      let content = result.content.trim();
      content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    } catch {
      const hasErrors = recentSteps.some(s => s.type === 'error');
      parsed = {
        progressScore: 0.5,
        qualityScore: hasErrors ? 0.3 : 0.7,
        needsRetry: hasErrors,
        needsAdaptation: false,
        reflection: 'Évaluation impossible à parser, progression estimée modérée.',
        recommendation: hasErrors ? 'retry' : 'continuer',
        confidenceInResult: 0.5,
      };
    }

    const reflectionStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'reflection',
      content: parsed.reflection,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      reflectionScore: parsed.progressScore,
      confidence: parsed.confidenceInResult,
      needsRetry: parsed.needsRetry,
      alternativeApproach: parsed.alternativeApproach,
      retryCount: state.retryCount,
    };
    state.steps.push(reflectionStep);

    // Update state from reflection
    state.progressScore = parsed.progressScore;
    state.confidence = parsed.confidenceInResult;
    state.reflectionResult = parsed;

    // Handle recommendation for plan adaptation
    if (parsed.needsAdaptation && parsed.recommendation === 'adapt') {
      await adaptGraphPlan(state, parsed.alternativeApproach || '');
    }

    state.metadata.tokensUsed += Math.ceil(result.content.length / 4);
    state.metadata.modelUsed = result.model;
    state.metadata.providerUsed = result.provider;
  } catch (error) {
    const errorStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'error',
      content: `Erreur de réflexion: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
    };
    state.steps.push(errorStep);
    state.consecutiveErrors++;
    state.reflectionResult = {
      progressScore: state.progressScore,
      qualityScore: 0.5,
      needsRetry: false,
      needsAdaptation: false,
      reflection: 'Erreur de réflexion — continuation sans correction',
      recommendation: 'continuer',
      confidenceInResult: 0.3,
    };
  }

  state.status = 'running';
  state.metadata.durationMs += Date.now() - startTime;
  state.lastUpdatedAt = new Date().toISOString();

  return state;
}

/**
 * CORRECT node — Self-correction when something goes wrong
 */
async function correctNode(state: AgentState, _toolRegistry: ToolRegistry): Promise<AgentState> {
  const startTime = Date.now();

  // Find the last failed/error step to correct
  const lastError = [...state.steps].reverse().find(s => s.type === 'error' || s.needsRetry);
  const lastAction = [...state.steps].reverse().find(s => s.type === 'action');
  const alternativeApproach = state.reflectionResult?.alternativeApproach;

  const correctionPrompt = `Tu es ${state.agentName}. Ta dernière action a échoué et tu dois corriger ton approche.

## Objectif
${state.task}

## Dernière action tentée
${lastAction ? `Outil: ${lastAction.toolName}\nParamètres: ${JSON.stringify(lastAction.toolInput || {})}` : 'Aucune action précédente'}

## Erreur rencontrée
${lastError?.content || 'Erreur inconnue'}

## Approche alternative suggérée
${alternativeApproach || 'Aucune suggestion, trouve une alternative toi-même'}

## Instructions
Analyse l'erreur et propose une action corrigée. Réponds en JSON:
{
  "analysis": "Analyse de pourquoi l'action a échoué",
  "correctedAction": "nom_de_l_outil_ou_respond",
  "correctedInput": { "param": "valeur" },
  "isFinal": false,
  "confidence": 0.0 à 1.0
}`;

  try {
    const result = await chatCompletion([
      { role: 'system', content: correctionPrompt },
      { role: 'user', content: 'Propose une action corrigée.' },
    ], 'reasoning');

    let parsed: {
      analysis: string;
      correctedAction: string;
      correctedInput: Record<string, unknown>;
      isFinal: boolean;
      confidence: number;
    };

    try {
      let content = result.content.trim();
      content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        analysis: result.content,
        correctedAction: 'respond',
        correctedInput: { message: result.content },
        isFinal: true,
        confidence: 0.3,
      };
    }

    const correctionStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'correction',
      content: parsed.analysis,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: parsed.confidence,
      retryCount: state.retryCount,
      alternativeApproach,
    };
    state.steps.push(correctionStep);

    state.correctionResult = parsed;

    // If the corrected action is a final response
    if (parsed.isFinal || parsed.correctedAction === 'respond') {
      state.finalResponse = (parsed.correctedInput?.message as string) || parsed.analysis;
    }

    state.metadata.tokensUsed += Math.ceil(result.content.length / 4);
    state.metadata.modelUsed = result.model;
    state.metadata.providerUsed = result.provider;
    state.confidence = parsed.confidence;
  } catch (error) {
    const errorStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'error',
      content: `Erreur lors de la correction: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
    };
    state.steps.push(errorStep);
    state.consecutiveErrors++;
    state.errorInfo = errorStep.content;
    state.correctionResult = {
      analysis: 'Correction impossible — erreur dans le système de correction',
      correctedAction: 'respond',
      correctedInput: { message: 'Correction impossible, abandon de la tentative' },
      isFinal: true,
      confidence: 0.1,
    };
  }

  state.metadata.durationMs += Date.now() - startTime;
  state.lastUpdatedAt = new Date().toISOString();

  return state;
}

/**
 * RETRY node — Retry with corrected approach
 */
async function retryNode(state: AgentState, _toolRegistry: ToolRegistry): Promise<AgentState> {
  const startTime = Date.now();
  state.status = 'retrying';

  state.retryCount++;

  const retryStep: ExecutionStep = {
    id: generateGraphStepId(),
    type: 'retry',
    content: `Tentative ${state.retryCount}/${state.maxRetries}${state.correctionResult ? `: ${state.correctionResult.analysis}` : ''}`,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    retryCount: state.retryCount,
  };
  state.steps.push(retryStep);

  // If correction result provided a new action, set it as pending
  if (state.correctionResult && !state.correctionResult.isFinal && state.correctionResult.correctedAction !== 'respond') {
    state.pendingAction = {
      toolName: state.correctionResult.correctedAction,
      toolInput: state.correctionResult.correctedInput || {},
      isFinal: false,
    };
  }

  // Reset consecutive errors on retry
  state.consecutiveErrors = 0;

  state.status = 'running';
  state.metadata.durationMs += Date.now() - startTime;
  state.lastUpdatedAt = new Date().toISOString();

  return state;
}

/**
 * RESPOND node — Generate final response
 */
async function respondNode(state: AgentState, _toolRegistry: ToolRegistry): Promise<AgentState> {
  const startTime = Date.now();

  // If we already have a final response, use it
  if (state.finalResponse) {
    const resultStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'result',
      content: state.finalResponse,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: state.confidence,
    };
    state.steps.push(resultStep);
  } else {
    // Generate a final response from the observations
    const observations = state.steps.filter(s => s.type === 'observation');
    const lastObservation = observations[observations.length - 1];

    if (lastObservation) {
      state.finalResponse = lastObservation.content;
    } else {
      state.finalResponse = 'Tâche terminée — aucun résultat spécifique à rapporter.';
    }

    const resultStep: ExecutionStep = {
      id: generateGraphStepId(),
      type: 'result',
      content: state.finalResponse,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: state.confidence,
    };
    state.steps.push(resultStep);
  }

  state.status = 'completed';
  state.metadata.durationMs += Date.now() - startTime;
  state.lastUpdatedAt = new Date().toISOString();

  return state;
}

/**
 * ERROR node — Handle unrecoverable errors
 */
async function errorNode(state: AgentState, _toolRegistry: ToolRegistry): Promise<AgentState> {
  const startTime = Date.now();

  const errorMessage = state.errorInfo || 'Erreur irrécupérable non spécifiée';

  const errorStep: ExecutionStep = {
    id: generateGraphStepId(),
    type: 'error',
    content: `Erreur irrécupérable: ${errorMessage}`,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    confidence: 0,
  };
  state.steps.push(errorStep);

  // Try to provide a graceful fallback response
  const observations = state.steps.filter(s => s.type === 'observation');
  if (observations.length > 0) {
    state.finalResponse = `L'exécution a rencontré une erreur: ${errorMessage}\n\nRésultats partiels:\n${observations.map(o => o.content.substring(0, 500)).join('\n')}`;
  } else {
    state.finalResponse = `L'exécution a échoué: ${errorMessage}`;
  }

  state.status = 'failed';
  state.metadata.durationMs += Date.now() - startTime;
  state.lastUpdatedAt = new Date().toISOString();

  return state;
}

/**
 * COMPLETE node — Task completed successfully
 */
async function completeNode(state: AgentState, _toolRegistry: ToolRegistry): Promise<AgentState> {
  const startTime = Date.now();

  // Store learnings in long-term memory
  try {
    const successfulObservations = state.steps.filter(
      s => s.type === 'observation' && s.confidence && s.confidence > 0.7
    );
    if (successfulObservations.length > 0) {
      const ltm = new LongTermMemory();
      for (const obs of successfulObservations) {
        await ltm.store({
          content: `Apprentissage de ${state.agentName}: ${obs.content.substring(0, 500)}`,
          category: 'agent_learning',
          tags: [state.agentType, obs.toolName || 'general', 'auto-learned', 'state-graph'],
          source: 'state-graph-execution',
          relevance: obs.confidence || 0.7,
          userId: state.userId,
        });
      }
    }
  } catch {
    // Memory storage failed — don't break completion
  }

  // Save final execution to database
  try {
    await db.agentExecution.create({
      data: {
        agentId: state.agentId,
        task: state.task,
        steps: JSON.stringify(state.steps),
        status: state.status,
        totalDuration: state.metadata.durationMs,
        totalTokens: state.metadata.tokensUsed || state.steps.length * 500,
        estimatedCost: state.metadata.estimatedCost || state.steps.length * 0.001,
        model: state.metadata.modelUsed || 'auto-routed',
        provider: state.metadata.providerUsed || 'state-graph',
        userId: state.userId,
        conversationId: state.conversationId,
      },
    });
  } catch {
    // Save failed — don't break completion
  }

  state.lastUpdatedAt = new Date().toISOString();
  state.metadata.durationMs += Date.now() - startTime;

  return state;
}

// ============================================================
// CONDITION FUNCTIONS — For conditional edges
// ============================================================

/**
 * THINK → ACT | RESPOND condition
 * If the THINK node determined a final response, go to RESPOND; otherwise ACT
 */
function thinkCondition(state: AgentState): string {
  if (state.pendingAction?.isFinal || state.pendingAction?.toolName === 'respond') {
    return 'isFinal';
  }
  if (state.finalResponse) {
    return 'isFinal';
  }
  return 'actionNeeded';
}

/**
 * REFLECT → THINK | CORRECT | COMPLETE condition
 */
function reflectCondition(state: AgentState): string {
  if (!state.reflectionResult) {
    return 'continue';
  }

  const { recommendation, needsRetry } = state.reflectionResult;

  if (recommendation === 'stop') {
    return 'done';
  }

  if (recommendation === 'respond') {
    // Set the final response from the last observation
    if (state.lastObservation) {
      state.finalResponse = state.lastObservation.content;
    }
    return 'done';
  }

  if (recommendation === 'retry' || needsRetry) {
    return 'needsRetry';
  }

  if (recommendation === 'adapt') {
    return 'continue'; // Adapt and continue — go back to THINK with adapted plan
  }

  // Default: continue to THINK
  return 'continue';
}

/**
 * RETRY → THINK | ERROR condition
 */
function retryCondition(state: AgentState): string {
  if (state.retryCount >= state.maxRetries) {
    return 'maxRetries';
  }

  // If the correction gave us a final response, go to ERROR (as a graceful exit)
  if (state.correctionResult?.isFinal || state.correctionResult?.correctedAction === 'respond') {
    state.finalResponse = state.finalResponse || (state.correctionResult?.correctedInput?.message as string) || 'Correction finale';
    state.status = 'completed';
    return 'maxRetries'; // Will route to ERROR → COMPLETE
  }

  return 'retriesLeft';
}

// ============================================================
// PLAN CREATION (adapted from execution-loop)
// ============================================================

async function createGraphExecutionPlan(state: AgentState): Promise<ExecutionPlan> {
  try {
    const planPrompt = `Tu es le planificateur de ${state.agentName}. Crée un plan d'exécution pour la tâche suivante.

## Tâche
${state.task}

## Outils disponibles
${state.tools.join(', ') || 'Aucun'}

Crée un plan simple avec 3-5 étapes maximum. Réponds en JSON:
{
  "steps": [
    { "description": "Description de l'étape", "toolHint": "outil_suggéré", "dependsOn": [] }
  ]
}

Réponds en français.`;

    const result = await chatCompletion([
      { role: 'system', content: planPrompt },
      { role: 'user', content: 'Crée le plan d\'exécution.' },
    ], 'orchestration');

    let parsed: { steps: Array<{ description: string; toolHint?: string; dependsOn?: string[] }> };
    try {
      let content = result.content.trim();
      content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        steps: [
          { description: 'Analyser la demande', toolHint: undefined },
          { description: 'Exécuter les actions nécessaires', toolHint: undefined },
          { description: 'Vérifier et présenter les résultats', toolHint: 'respond' },
        ],
      };
    }

    return {
      steps: parsed.steps.map((step, i) => ({
        id: `plan_step_${i}`,
        description: step.description,
        status: 'pending' as const,
        dependsOn: step.dependsOn,
        toolHint: step.toolHint,
      })),
      currentStepIndex: 0,
      adaptiveHistory: [],
    };
  } catch {
    return {
      steps: [{ id: 'plan_step_0', description: 'Exécuter la tâche', status: 'pending' as const }],
      currentStepIndex: 0,
      adaptiveHistory: [],
    };
  }
}

// ============================================================
// PLAN ADAPTATION
// ============================================================

async function adaptGraphPlan(state: AgentState, reason: string): Promise<void> {
  if (!state.plan) return;

  const currentStep = state.plan.steps[state.plan.currentStepIndex];
  if (!currentStep) return;

  state.plan.adaptiveHistory.push({
    stepIndex: state.plan.currentStepIndex,
    reason,
    originalPlan: currentStep.description,
    adaptedPlan: `Adapté: ${reason}`,
    timestamp: new Date().toISOString(),
  });

  currentStep.status = 'failed';
}

// ============================================================
// THINK PROMPT BUILDER
// ============================================================

function buildGraphThinkPrompt(state: AgentState, toolRegistry: ToolRegistry): string {
  const availableTools = state.tools
    .map(name => toolRegistry.get(name))
    .filter(Boolean);

  const toolDescriptions = availableTools.length > 0
    ? availableTools.map(t => `- ${t!.name}: ${t!.description}${t!.isDangerous ? ' [DANGEREUX]' : ''}`).join('\n')
    : 'Aucun outil disponible.';

  const stepHistory = state.steps
    .slice(-12)
    .map(step => {
      switch (step.type) {
        case 'thought': return `💭 Pensée: ${step.content}`;
        case 'action': return `🔧 Action: ${step.toolName}(${JSON.stringify(step.toolInput || {})})`;
        case 'observation': return `👁️ Observation: ${step.content.substring(0, 500)}`;
        case 'reflection': return `🪞 Réflexion (score: ${step.reflectionScore?.toFixed(2) || 'N/A'}): ${step.content}`;
        case 'correction': return `🔄 Correction: ${step.content}`;
        case 'retry': return `🔁 ${step.content}`;
        case 'error': return `❌ Erreur: ${step.content}`;
        case 'result': return `✅ Résultat: ${step.content}`;
        default: return step.content;
      }
    })
    .join('\n');

  const planContext = state.plan
    ? `## Plan actuel\nÉtape ${state.plan.currentStepIndex + 1}/${state.plan.steps.length}: ${state.plan.steps[state.plan.currentStepIndex]?.description || 'Terminé'}\nAdaptations: ${state.plan.adaptiveHistory.length}`
    : '';

  const retryContext = state.retryCount > 0
    ? `\n## Tentatives de correction\nTu as déjà fait ${state.retryCount} tentative(s) de correction sur ${state.maxRetries} autorisées. Dernière correction: ${state.correctionResult?.analysis || 'Aucune'}`
    : '';

  return `Tu es ${state.agentName}, un agent IA de type ${state.agentType} avec une architecture autonome Think→Act→Observe→Reflect→Retry.

## Ta mission
${state.task}

## Configuration de l'agent
${JSON.stringify(state.agentConfig, null, 2)}

## Mémoire à long terme
${state.memory.longTermContext || 'Aucune mémoire à long terme pertinente.'}

## Outils disponibles
${toolDescriptions}

${planContext}

## Historique d'exécution
${stepHistory || 'Aucune étape précédente.'}
${retryContext}

## Cycle d'exécution autonome
Tu suis le cycle: THINK → ACT → OBSERVE → REFLECT → (RETRY si nécessaire)
- THINK: Raisonne sur la situation, analyse les options
- ACT: Choisis et exécute un outil
- OBSERVE: Observe le résultat de l'action
- REFLECT: Évalue ta progression, décide si tu dois réessayer ou adapter
- RETRY: Si une action échoue, corrige et réessaie avec une approche différente

Tu as au maximum ${state.maxSteps} étapes et ${state.maxRetries} tentatives de correction.
Itération actuelle: ${state.iterationCount}/${state.maxIterations}

## Format de réponse OBLIGATOIRE
Réponds UNIQUEMENT en JSON valide:
{
  "thought": "Ton raisonnement détaillé sur la situation et ta décision",
  "action": "nom_de_l_outil_ou_respond",
  "actionInput": { "param": "valeur" },
  "isFinal": false,
  "confidence": 0.0 à 1.0
}

Si "action" est "respond", c'est ta réponse finale et "isFinal" doit être true.
Si "action" est un nom d'outil, "actionInput" contient les paramètres.
"confidence" indique ton niveau de confiance dans cette action.

Réponds TOUJOURS en français.`;
}

// ============================================================
// CREATE DEFAULT GENOVA AGENT GRAPH
// ============================================================

/**
 * Create the default Genova agent state graph with the standard transitions:
 *
 * - INIT → PLAN (always)
 * - PLAN → THINK (always)
 * - THINK → ACT (if action needed) | THINK → RESPOND (if isFinal)
 * - ACT → OBSERVE (always)
 * - OBSERVE → REFLECT (always)
 * - REFLECT → THINK (if continue) | REFLECT → CORRECT (if needsRetry) | REFLECT → COMPLETE (if done)
 * - CORRECT → RETRY (always)
 * - RETRY → THINK (if retries left) | RETRY → ERROR (if max retries)
 * - RESPOND → COMPLETE (always)
 * - ERROR → COMPLETE (always)
 */
export function createGenovaAgentGraph(): StateGraph {
  const graph = new StateGraph();

  // Add all nodes
  graph.addNode('INIT', initNode);
  graph.addNode('PLAN', planNode);
  graph.addNode('THINK', thinkNode);
  graph.addNode('ACT', actNode);
  graph.addNode('OBSERVE', observeNode);
  graph.addNode('REFLECT', reflectNode);
  graph.addNode('CORRECT', correctNode);
  graph.addNode('RETRY', retryNode);
  graph.addNode('RESPOND', respondNode);
  graph.addNode('ERROR', errorNode);
  graph.addNode('COMPLETE', completeNode);

  // Set entry and finish points
  graph.setEntryPoint('INIT');
  graph.setFinishPoint('COMPLETE');

  // Add unconditional edges
  graph.addEdge('INIT', 'PLAN');
  graph.addEdge('PLAN', 'THINK');
  graph.addEdge('ACT', 'OBSERVE');
  graph.addEdge('OBSERVE', 'REFLECT');
  graph.addEdge('CORRECT', 'RETRY');
  graph.addEdge('RESPOND', 'COMPLETE');
  graph.addEdge('ERROR', 'COMPLETE');

  // Add conditional edges
  // THINK → ACT (if action needed) | THINK → RESPOND (if isFinal)
  graph.addConditionalEdge('THINK', thinkCondition, {
    actionNeeded: 'ACT',
    isFinal: 'RESPOND',
  });

  // REFLECT → THINK (if continue) | REFLECT → CORRECT (if needsRetry) | REFLECT → COMPLETE (if done)
  graph.addConditionalEdge('REFLECT', reflectCondition, {
    continue: 'THINK',
    needsRetry: 'CORRECT',
    done: 'COMPLETE',
  });

  // RETRY → THINK (if retries left) | RETRY → ERROR (if max retries)
  graph.addConditionalEdge('RETRY', retryCondition, {
    retriesLeft: 'THINK',
    maxRetries: 'ERROR',
  });

  return graph;
}

// ============================================================
// CONVENIENCE FUNCTION — Execute with the default Genova graph
// ============================================================

/**
 * Create an AgentState from an ExecutionContext (for integration with the existing execution loop)
 */
export function executionContextToAgentState(ctx: ExecutionContext): AgentState {
  return {
    agentId: ctx.agentId,
    agentName: ctx.agentName,
    agentType: ctx.agentType,
    agentConfig: ctx.agentConfig,
    task: ctx.task,
    conversationId: ctx.conversationId,
    userId: ctx.userId,
    currentPhase: 'INIT',
    previousPhase: null,
    phaseHistory: [],
    steps: ctx.steps,
    maxSteps: ctx.maxSteps,
    maxRetries: ctx.maxRetries,
    retryCount: 0,
    memory: ctx.memory,
    tools: ctx.tools,
    guardrailsActive: ctx.guardrailsActive,
    plan: ctx.plan,
    confidence: 0.5,
    progressScore: 0,
    errorInfo: null,
    consecutiveErrors: 0,
    metadata: {
      tokensUsed: ctx.totalTokensUsed,
      estimatedCost: ctx.totalCost,
      durationMs: 0,
      modelUsed: 'auto-routed',
      providerUsed: 'groq/openrouter',
    },
    status: ctx.status,
    startedAt: ctx.startedAt,
    lastUpdatedAt: ctx.lastUpdatedAt,
    iterationCount: 0,
    maxIterations: ctx.maxSteps,
    executionId: ctx.executionId,
  };
}

/**
 * Convert an AgentState back to an ExecutionContext (for integration)
 */
export function agentStateToExecutionContext(state: AgentState): ExecutionContext {
  return {
    agentId: state.agentId,
    agentName: state.agentName,
    agentType: state.agentType,
    agentConfig: state.agentConfig,
    task: state.task,
    conversationId: state.conversationId,
    userId: state.userId,
    maxSteps: state.maxSteps,
    maxRetries: state.maxRetries,
    steps: state.steps,
    status: state.status,
    memory: state.memory,
    tools: state.tools,
    guardrailsActive: state.guardrailsActive,
    plan: state.plan,
    executionId: state.executionId,
    startedAt: state.startedAt,
    lastUpdatedAt: state.lastUpdatedAt,
    totalTokensUsed: state.metadata.tokensUsed,
    totalCost: state.metadata.estimatedCost,
  };
}

/**
 * Execute an agent task using the LangGraph-style state graph
 * This is an alternative execution mode to the standard execution loop
 */
export async function executeWithStateGraph(
  context: ExecutionContext,
  toolRegistry: ToolRegistry,
  onStep?: (step: ExecutionStep) => void,
  onGraphEvent?: GraphEventCallback
): Promise<ExecutionStep[]> {
  // Create the default graph
  const graph = createGenovaAgentGraph();

  // Register step callback as a graph event
  if (onStep) {
    graph.onEvent((event) => {
      if (event.type === 'node_exit' || event.type === 'node_error') {
        // Emit the latest step from the state
        const latestStep = event.state.steps[event.state.steps.length - 1];
        if (latestStep) {
          onStep(latestStep);
        }
      }
    });
  }

  // Register custom graph event callback
  if (onGraphEvent) {
    graph.onEvent(onGraphEvent);
  }

  // Compile the graph
  const compiled = graph.compile();

  // Convert context to agent state
  const initialState = executionContextToAgentState(context);

  // Create executor
  const executor = new GraphExecutor(compiled, graph.getEventCallbacks(), {
    maxNodeVisits: 5,
    maxTotalIterations: context.maxSteps * 2,
    persistenceEnabled: true,
    persistenceIntervalMs: 15000,
  });

  // Execute the graph
  const finalState = await executor.execute(initialState, toolRegistry);

  // Update the original context with final state
  context.steps = finalState.steps;
  context.status = finalState.status;
  context.totalTokensUsed = finalState.metadata.tokensUsed;
  context.totalCost = finalState.metadata.estimatedCost;
  context.lastUpdatedAt = finalState.lastUpdatedAt;
  if (finalState.plan) {
    context.plan = finalState.plan;
  }

  return finalState.steps;
}
