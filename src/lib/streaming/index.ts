// Streaming Engine — Robust SSE + WebSocket streaming architecture
// Features: Live token streaming, progress updates, agent step streaming, error recovery
// Architecture: StreamManager → SSE Encoder → Progress Tracker → Client Connection
// Enhanced: Token buffering, heartbeat, backpressure, event batching, health monitoring

// ============================================================
// INTERFACES
// ============================================================

export interface StreamEvent {
  type: 'token' | 'step' | 'progress' | 'error' | 'complete' | 'metadata' | 'thinking' | 'tool_call' | 'tool_result' | 'reflection' | 'heartbeat' | 'batch';
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
  /** Whether the client connection is still healthy */
  healthy: boolean;
  /** Number of consecutive failed sends */
  consecutiveFailures: number;
  /** Buffered events waiting to be flushed (backpressure) */
  buffer: StreamEvent[];
  /** Whether the buffer flush timer is active */
  flushTimerActive: boolean;
  /** Last heartbeat sent timestamp */
  lastHeartbeatAt: string;
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
// CONNECTION HEALTH STATUS
// ============================================================

export interface ConnectionHealth {
  connectionId: string;
  healthy: boolean;
  eventsSent: number;
  consecutiveFailures: number;
  bufferedEvents: number;
  ageMs: number;
  lastEventAgeMs: number;
  lastHeartbeatAgeMs: number;
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
   * Encode a batch event — combines multiple events into a single SSE message
   */
  static encodeBatchedEvent(events: StreamEvent[]): string {
    if (events.length === 0) return '';
    if (events.length === 1) return SSEEncoder.encode(events[0]);

    const batchEvent: StreamEvent = {
      id: `batch_${Date.now()}`,
      type: 'batch',
      data: {
        events: events.map(e => ({
          id: e.id,
          type: e.type,
          data: e.data,
          timestamp: e.timestamp,
        })),
        count: events.length,
      },
      timestamp: new Date().toISOString(),
    };

    return SSEEncoder.encode(batchEvent);
  }

  /**
   * Create a ping event (keeps connection alive)
   */
  static ping(): string {
    return `:ping\n\n`;
  }

  /**
   * Create a heartbeat event
   */
  static heartbeat(connectionId: string): string {
    const event: StreamEvent = {
      id: `hb_${Date.now()}`,
      type: 'heartbeat',
      data: { connectionId, timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    };
    return SSEEncoder.encode(event);
  }

  /**
   * Create a done event
   */
  static done(): string {
    return `event: done\ndata: [DONE]\n\n`;
  }
}

// ============================================================
// TOKEN BUFFER — Buffers tokens and flushes at intervals
// ============================================================

export class TokenBuffer {
  private buffer: Array<{ token: string; metadata?: Record<string, unknown> }> = [];
  private flushIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onFlush: (tokens: Array<{ token: string; metadata?: Record<string, unknown> }>) => void;

  constructor(
    onFlush: (tokens: Array<{ token: string; metadata?: Record<string, unknown> }>) => void,
    flushIntervalMs: number = 50
  ) {
    this.onFlush = onFlush;
    this.flushIntervalMs = flushIntervalMs;
  }

  /**
   * Add a token to the buffer
   */
  push(token: string, metadata?: Record<string, unknown>): void {
    this.buffer.push({ token, metadata });

    // Start the flush timer if not active
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
    }
  }

  /**
   * Flush all buffered tokens
   */
  flush(): void {
    if (this.buffer.length === 0) return;

    const tokens = [...this.buffer];
    this.buffer = [];

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.onFlush(tokens);
  }

  /**
   * Force flush and stop the timer
   */
  forceFlush(): void {
    this.flush();
  }

  /**
   * Get the number of buffered tokens
   */
  get size(): number {
    return this.buffer.length;
  }

  /**
   * Destroy the buffer and clean up
   */
  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.buffer = [];
  }
}

// ============================================================
// EVENT BATCHER — Combines rapid events into batches
// ============================================================

export class EventBatcher {
  private batch: StreamEvent[] = [];
  private batchIntervalMs: number;
  private maxBatchSize: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onFlush: (events: StreamEvent[]) => void;

  constructor(
    onFlush: (events: StreamEvent[]) => void,
    batchIntervalMs: number = 100,
    maxBatchSize: number = 20
  ) {
    this.onFlush = onFlush;
    this.batchIntervalMs = batchIntervalMs;
    this.maxBatchSize = maxBatchSize;
  }

  /**
   * Add an event to the batch
   */
  push(event: StreamEvent): void {
    this.batch.push(event);

    // Flush immediately if batch is full
    if (this.batch.length >= this.maxBatchSize) {
      this.flush();
      return;
    }

    // Start timer if not active
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), this.batchIntervalMs);
    }
  }

  /**
   * Flush all batched events
   */
  flush(): void {
    if (this.batch.length === 0) return;

    const events = [...this.batch];
    this.batch = [];

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.onFlush(events);
  }

  /**
   * Get the number of batched events
   */
  get size(): number {
    return this.batch.length;
  }

  /**
   * Destroy the batcher and clean up
   */
  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.batch = [];
  }
}

// ============================================================
// STREAM MANAGER
// ============================================================

export class StreamManager {
  private connections: Map<string, StreamConnection> = new Map();
  private eventCounter = 0;
  private heartbeatIntervalMs: number = 15000; // 15 seconds
  private maxBufferSize: number = 100; // Max buffered events per connection
  private maxConsecutiveFailures: number = 5;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: { heartbeatIntervalMs?: number; maxBufferSize?: number; maxConsecutiveFailures?: number }) {
    if (options?.heartbeatIntervalMs) this.heartbeatIntervalMs = options.heartbeatIntervalMs;
    if (options?.maxBufferSize) this.maxBufferSize = options.maxBufferSize;
    if (options?.maxConsecutiveFailures) this.maxConsecutiveFailures = options.maxConsecutiveFailures;

    // Start heartbeat timer
    this.startHeartbeat();
  }

  /**
   * Start the heartbeat timer that sends pings to all connections
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeats();
    }, this.heartbeatIntervalMs);
  }

  /**
   * Send heartbeat pings to all active connections
   */
  private sendHeartbeats(): void {
    for (const [id, connection] of this.connections.entries()) {
      if (!connection.healthy) continue;

      try {
        const heartbeatData = SSEEncoder.heartbeat(id);
        connection.controller.enqueue(new TextEncoder().encode(heartbeatData));
        connection.lastHeartbeatAt = new Date().toISOString();
      } catch {
        connection.consecutiveFailures++;
        if (connection.consecutiveFailures >= this.maxConsecutiveFailures) {
          connection.healthy = false;
          this.closeConnection(id);
        }
      }
    }
  }

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
          healthy: true,
          consecutiveFailures: 0,
          buffer: [],
          flushTimerActive: false,
          lastHeartbeatAt: new Date().toISOString(),
        };
        this.connections.set(connectionId, connection);

        // Send initial connection event
        this.sendEvent(connectionId, {
          type: 'metadata',
          data: { connectionId, version: '3.0', features: ['token_streaming', 'progress', 'steps', 'heartbeat', 'batching', 'backpressure'] },
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

    // Check if we should buffer (backpressure handling)
    if (connection.buffer.length > 0 || !connection.healthy) {
      // If there are already buffered events or connection is unhealthy, buffer this one too
      if (connection.buffer.length < this.maxBufferSize) {
        connection.buffer.push(fullEvent);
        this.scheduleBufferFlush(connectionId);
        return true;
      } else {
        // Buffer is full — drop the oldest event and add the new one
        connection.buffer.shift();
        connection.buffer.push(fullEvent);
        this.scheduleBufferFlush(connectionId);
        return true;
      }
    }

    try {
      const encoded = SSEEncoder.encode(fullEvent);
      connection.controller.enqueue(new TextEncoder().encode(encoded));
      connection.lastEventAt = new Date().toISOString();
      connection.eventsSent++;
      connection.consecutiveFailures = 0;
      return true;
    } catch {
      connection.consecutiveFailures++;

      if (connection.consecutiveFailures >= this.maxConsecutiveFailures) {
        connection.healthy = false;
        this.closeConnection(connectionId);
        return false;
      }

      // Buffer the event for retry
      if (connection.buffer.length < this.maxBufferSize) {
        connection.buffer.push(fullEvent);
        this.scheduleBufferFlush(connectionId);
      }

      return false;
    }
  }

  /**
   * Schedule a buffer flush for a connection
   */
  private scheduleBufferFlush(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.flushTimerActive) return;

    connection.flushTimerActive = true;

    // Use setImmediate-like behavior with setTimeout
    setTimeout(() => {
      this.flushBuffer(connectionId);
    }, 50);
  }

  /**
   * Flush buffered events for a connection
   */
  private flushBuffer(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.flushTimerActive = false;

    if (connection.buffer.length === 0) return;

    // Send buffered events as a batch
    const eventsToSend = [...connection.buffer];
    connection.buffer = [];

    try {
      // If there's only one event, send it normally
      if (eventsToSend.length === 1) {
        const encoded = SSEEncoder.encode(eventsToSend[0]);
        connection.controller.enqueue(new TextEncoder().encode(encoded));
      } else {
        // Send as a batch event
        const batchEncoded = SSEEncoder.encodeBatchedEvent(eventsToSend);
        connection.controller.enqueue(new TextEncoder().encode(batchEncoded));
      }

      connection.lastEventAt = new Date().toISOString();
      connection.eventsSent += eventsToSend.length;
      connection.consecutiveFailures = 0;
    } catch {
      // Re-buffer the events
      connection.buffer = [...eventsToSend, ...connection.buffer].slice(0, this.maxBufferSize);
      connection.consecutiveFailures++;

      if (connection.consecutiveFailures >= this.maxConsecutiveFailures) {
        connection.healthy = false;
        this.closeConnection(connectionId);
      }
    }
  }

  /**
   * Send a token with buffering support
   */
  sendToken(connectionId: string, token: string, metadata?: Record<string, unknown>): boolean {
    return this.sendEvent(connectionId, {
      type: 'token',
      data: { token, ...metadata },
    });
  }

  /**
   * Send buffered tokens — flush multiple tokens at once for smoother rendering
   */
  sendBufferedTokens(connectionId: string, tokens: Array<{ token: string; metadata?: Record<string, unknown> }>): boolean {
    if (tokens.length === 0) return true;
    if (tokens.length === 1) {
      return this.sendToken(connectionId, tokens[0].token, tokens[0].metadata);
    }

    const batchEvent: StreamEvent = {
      id: `btok_${Date.now()}_${++this.eventCounter}`,
      type: 'batch',
      data: {
        events: tokens.map((t, i) => ({
          id: `tok_${Date.now()}_${i}`,
          type: 'token',
          data: { token: t.token, ...t.metadata },
          timestamp: new Date().toISOString(),
        })),
        count: tokens.length,
      },
      timestamp: new Date().toISOString(),
    };

    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    try {
      const encoded = SSEEncoder.encode(batchEvent);
      connection.controller.enqueue(new TextEncoder().encode(encoded));
      connection.lastEventAt = new Date().toISOString();
      connection.eventsSent += tokens.length;
      return true;
    } catch {
      return false;
    }
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

    // Flush any remaining buffered events
    this.flushBuffer(connectionId);

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
      // Flush remaining buffer
      if (connection.buffer.length > 0) {
        try {
          this.flushBuffer(connectionId);
        } catch {
          // Ignore flush errors on close
        }
      }

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
  getStats(): { activeConnections: number; totalEventsSent: number; healthyConnections: number; totalBufferedEvents: number } {
    let totalEvents = 0;
    let healthyCount = 0;
    let totalBuffered = 0;

    for (const conn of this.connections.values()) {
      totalEvents += conn.eventsSent;
      totalBuffered += conn.buffer.length;
      if (conn.healthy) healthyCount++;
    }

    return {
      activeConnections: this.connections.size,
      totalEventsSent: totalEvents,
      healthyConnections: healthyCount,
      totalBufferedEvents: totalBuffered,
    };
  }

  /**
   * Get health status of a specific connection
   */
  getConnectionHealth(connectionId: string): ConnectionHealth | null {
    const connection = this.connections.get(connectionId);
    if (!connection) return null;

    const now = Date.now();
    return {
      connectionId: connection.id,
      healthy: connection.healthy,
      eventsSent: connection.eventsSent,
      consecutiveFailures: connection.consecutiveFailures,
      bufferedEvents: connection.buffer.length,
      ageMs: now - new Date(connection.createdAt).getTime(),
      lastEventAgeMs: now - new Date(connection.lastEventAt).getTime(),
      lastHeartbeatAgeMs: now - new Date(connection.lastHeartbeatAt).getTime(),
    };
  }

  /**
   * Get health status of all connections
   */
  getAllConnectionHealth(): ConnectionHealth[] {
    const healths: ConnectionHealth[] = [];
    for (const [id] of this.connections.entries()) {
      const health = this.getConnectionHealth(id);
      if (health) healths.push(health);
    }
    return healths;
  }

  /**
   * Attempt to reconnect an unhealthy connection
   */
  attemptReconnect(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    // Try to flush the buffer
    try {
      this.flushBuffer(connectionId);
      connection.healthy = true;
      connection.consecutiveFailures = 0;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up stale connections
   */
  cleanupStaleConnections(maxAgeMs: number = 300000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;

    for (const [id, conn] of this.connections.entries()) {
      if (new Date(conn.lastEventAt).getTime() < cutoff || !conn.healthy) {
        this.closeConnection(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Destroy the stream manager and clean up all resources
   */
  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const [id] of this.connections.entries()) {
      this.closeConnection(id);
    }
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

// ============================================================
// SSE CLIENT PARSER — Parse SSE events on the client side
// ============================================================

export interface SSEParsedEvent {
  id: string;
  event: string;
  data: string;
}

/**
 * Parse an SSE message string into structured events
 */
export function parseSSEMessage(raw: string): SSEParsedEvent[] {
  const events: SSEParsedEvent[] = [];
  const chunks = raw.split('\n\n').filter(c => c.trim());

  for (const chunk of chunks) {
    let id = '';
    let event = 'message';
    let data = '';

    for (const line of chunk.split('\n')) {
      if (line.startsWith('id: ')) {
        id = line.slice(4);
      } else if (line.startsWith('event: ')) {
        event = line.slice(7);
      } else if (line.startsWith('data: ')) {
        data += line.slice(6);
      } else if (line.startsWith(':')) {
        // Comment/ping, ignore
      }
    }

    if (data) {
      events.push({ id, event, data });
    }
  }

  return events;
}

// Singleton stream manager
let globalStreamManager: StreamManager | null = null;

export function getStreamManager(): StreamManager {
  if (!globalStreamManager) {
    globalStreamManager = new StreamManager();
  }
  return globalStreamManager;
}
