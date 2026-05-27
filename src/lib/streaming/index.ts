// Streaming Engine — Robust SSE + WebSocket streaming architecture
// Features: Live token streaming, progress updates, agent step streaming, error recovery
// Architecture: StreamManager → SSE Encoder → Progress Tracker → Client Connection

// ============================================================
// INTERFACES
// ============================================================

export interface StreamEvent {
  type: 'token' | 'step' | 'progress' | 'error' | 'complete' | 'metadata' | 'thinking' | 'tool_call' | 'tool_result' | 'reflection';
  data: Record<string, unknown>;
  timestamp: string;
  id: string;
}

export interface StreamConnection {
  id: string;
  controller: ReadableStreamDefaultController;
  createdAt: string;
  lastEventAt: string;
  eventsSent: number;
}

export interface ProgressUpdate {
  step: number;
  totalSteps: number;
  percentage: number;
  currentAction: string;
  phase: 'thinking' | 'acting' | 'observing' | 'reflecting' | 'completed' | 'error';
  estimatedTimeRemaining?: number;
}

// ============================================================
// SSE STREAM ENCODER
// ============================================================

export class SSEEncoder {
  /**
   * Encode a stream event as an SSE message
   */
  static encode(event: StreamEvent): string {
    return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  }

  /**
   * Encode multiple events
   */
  static encodeBatch(events: StreamEvent[]): string {
    return events.map(e => SSEEncoder.encode(e)).join('');
  }

  /**
   * Create a ping event (keeps connection alive)
   */
  static ping(): string {
    return `:ping\n\n`;
  }

  /**
   * Create a done event
   */
  static done(): string {
    return `event: done\ndata: [DONE]\n\n`;
  }
}

// ============================================================
// STREAM MANAGER
// ============================================================

export class StreamManager {
  private connections: Map<string, StreamConnection> = new Map();
  private eventCounter = 0;

  /**
   * Create a new SSE stream for a client connection
   */
  createStream(): { stream: ReadableStream; connectionId: string } {
    const connectionId = `conn_${Date.now()}_${++this.eventCounter}`;

    const stream = new ReadableStream({
      start: (controller) => {
        const connection: StreamConnection = {
          id: connectionId,
          controller,
          createdAt: new Date().toISOString(),
          lastEventAt: new Date().toISOString(),
          eventsSent: 0,
        };
        this.connections.set(connectionId, connection);

        // Send initial connection event
        this.sendEvent(connectionId, {
          type: 'metadata',
          data: { connectionId, version: '2.0', features: ['token_streaming', 'progress', 'steps'] },
        });
      },
      cancel: () => {
        this.connections.delete(connectionId);
      },
    });

    return { stream, connectionId };
  }

  /**
   * Send an event to a specific connection
   */
  sendEvent(connectionId: string, event: Omit<StreamEvent, 'id' | 'timestamp'>): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    const fullEvent: StreamEvent = {
      ...event,
      id: `evt_${Date.now()}_${++this.eventCounter}`,
      timestamp: new Date().toISOString(),
    };

    try {
      const encoded = SSEEncoder.encode(fullEvent);
      connection.controller.enqueue(new TextEncoder().encode(encoded));
      connection.lastEventAt = new Date().toISOString();
      connection.eventsSent++;
      return true;
    } catch {
      this.connections.delete(connectionId);
      return false;
    }
  }

  /**
   * Send a token (word-by-word streaming)
   */
  sendToken(connectionId: string, token: string, metadata?: Record<string, unknown>): boolean {
    return this.sendEvent(connectionId, {
      type: 'token',
      data: { token, ...metadata },
    });
  }

  /**
   * Send a thinking step
   */
  sendThinking(connectionId: string, thought: string, confidence?: number): boolean {
    return this.sendEvent(connectionId, {
      type: 'thinking',
      data: { thought, confidence },
    });
  }

  /**
   * Send a tool call event
   */
  sendToolCall(connectionId: string, toolName: string, input: Record<string, unknown>): boolean {
    return this.sendEvent(connectionId, {
      type: 'tool_call',
      data: { toolName, input },
    });
  }

  /**
   * Send a tool result event
   */
  sendToolResult(connectionId: string, toolName: string, result: unknown, duration: number): boolean {
    return this.sendEvent(connectionId, {
      type: 'tool_result',
      data: { toolName, result, duration },
    });
  }

  /**
   * Send a reflection event
   */
  sendReflection(connectionId: string, reflection: string, score: number, needsRetry: boolean): boolean {
    return this.sendEvent(connectionId, {
      type: 'reflection',
      data: { reflection, score, needsRetry },
    });
  }

  /**
   * Send a progress update
   */
  sendProgress(connectionId: string, update: ProgressUpdate): boolean {
    return this.sendEvent(connectionId, {
      type: 'progress',
      data: { ...update },
    });
  }

  /**
   * Send an error event
   */
  sendError(connectionId: string, error: string, code?: string): boolean {
    return this.sendEvent(connectionId, {
      type: 'error',
      data: { error, code },
    });
  }

  /**
   * Send completion event and close connection
   */
  sendComplete(connectionId: string, result: Record<string, unknown>): boolean {
    const sent = this.sendEvent(connectionId, {
      type: 'complete',
      data: result,
    });

    const connection = this.connections.get(connectionId);
    if (connection) {
      try {
        connection.controller.enqueue(new TextEncoder().encode(SSEEncoder.done()));
        connection.controller.close();
      } catch {
        // Already closed
      }
      this.connections.delete(connectionId);
    }

    return sent;
  }

  /**
   * Close a connection
   */
  closeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      try {
        connection.controller.close();
      } catch {
        // Already closed
      }
      this.connections.delete(connectionId);
    }
  }

  /**
   * Get connection stats
   */
  getStats(): { activeConnections: number; totalEventsSent: number } {
    let totalEvents = 0;
    for (const conn of this.connections.values()) {
      totalEvents += conn.eventsSent;
    }
    return {
      activeConnections: this.connections.size,
      totalEventsSent: totalEvents,
    };
  }

  /**
   * Clean up stale connections
   */
  cleanupStaleConnections(maxAgeMs: number = 300000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;

    for (const [id, conn] of this.connections.entries()) {
      if (new Date(conn.lastEventAt).getTime() < cutoff) {
        this.closeConnection(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// ============================================================
// PROGRESS TRACKER
// ============================================================

export class ProgressTracker {
  private step: number = 0;
  private totalSteps: number = 0;
  private startTime: number = Date.now();

  setTotalSteps(total: number): void {
    this.totalSteps = total;
  }

  advance(action: string, phase: ProgressUpdate['phase']): ProgressUpdate {
    this.step++;

    const elapsed = Date.now() - this.startTime;
    const avgStepTime = elapsed / this.step;
    const remaining = (this.totalSteps - this.step) * avgStepTime;

    return {
      step: this.step,
      totalSteps: this.totalSteps,
      percentage: this.totalSteps > 0 ? Math.round((this.step / this.totalSteps) * 100) : 0,
      currentAction: action,
      phase,
      estimatedTimeRemaining: this.step > 1 ? Math.round(remaining / 1000) : undefined,
    };
  }

  getCurrentProgress(): ProgressUpdate {
    return {
      step: this.step,
      totalSteps: this.totalSteps,
      percentage: this.totalSteps > 0 ? Math.round((this.step / this.totalSteps) * 100) : 0,
      currentAction: 'En cours...',
      phase: 'thinking',
    };
  }

  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }
}

// Singleton stream manager
let globalStreamManager: StreamManager | null = null;

export function getStreamManager(): StreamManager {
  if (!globalStreamManager) {
    globalStreamManager = new StreamManager();
  }
  return globalStreamManager;
}
