// Tracer — Execution tracing and observability

export interface TraceStep {
  type: string;
  content: string;
  duration: number;
  tokensUsed: number;
  model: string;
  provider: string;
  toolName?: string;
  toolDuration?: number;
}

export interface Trace {
  id: string;
  agentId: string;
  task: string;
  steps: TraceStep[];
  totalDuration: number;
  totalTokens: number;
  estimatedCost: number;
  status: 'running' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

export class Tracer {
  private traces: Map<string, Trace> = new Map();
  private traceCounter = 0;

  /**
   * Start a new trace
   */
  startTrace(agentId: string, task: string): string {
    const id = `trace_${Date.now()}_${++this.traceCounter}`;
    this.traces.set(id, {
      id,
      agentId,
      task,
      steps: [],
      totalDuration: 0,
      totalTokens: 0,
      estimatedCost: 0,
      status: 'running',
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  /**
   * Add a step to the trace
   */
  addStep(traceId: string, step: TraceStep): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    trace.steps.push(step);
    trace.totalDuration += step.duration;
    trace.totalTokens += step.tokensUsed;
    trace.estimatedCost += step.tokensUsed * 0.00001; // Rough cost estimate
  }

  /**
   * End a trace
   */
  endTrace(traceId: string, status: 'completed' | 'failed'): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    trace.status = status;
    trace.completedAt = new Date().toISOString();
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Get all traces for an agent
   */
  getAgentTraces(agentId: string): Trace[] {
    return Array.from(this.traces.values())
      .filter(t => t.agentId === agentId);
  }

  /**
   * Get all traces
   */
  getAllTraces(): Trace[] {
    return Array.from(this.traces.values());
  }

  /**
   * Get metrics summary
   */
  getMetrics(): {
    totalTraces: number;
    avgDuration: number;
    totalCost: number;
    errorRate: number;
    totalTokens: number;
  } {
    const traces = Array.from(this.traces.values());
    const completed = traces.filter(t => t.status !== 'running');
    const failed = traces.filter(t => t.status === 'failed');

    return {
      totalTraces: traces.length,
      avgDuration: completed.length > 0
        ? completed.reduce((sum, t) => sum + t.totalDuration, 0) / completed.length
        : 0,
      totalCost: traces.reduce((sum, t) => sum + t.estimatedCost, 0),
      errorRate: completed.length > 0 ? failed.length / completed.length : 0,
      totalTokens: traces.reduce((sum, t) => sum + t.totalTokens, 0),
    };
  }

  /**
   * Clean up old traces to prevent memory leaks
   */
  cleanup(maxTraces: number = 500): void {
    if (this.traces.size <= maxTraces) return;

    const sorted = Array.from(this.traces.entries())
      .sort((a, b) => new Date(b[1].createdAt).getTime() - new Date(a[1].createdAt).getTime());

    this.traces.clear();
    for (let i = 0; i < maxTraces; i++) {
      this.traces.set(sorted[i][0], sorted[i][1]);
    }
  }
}
