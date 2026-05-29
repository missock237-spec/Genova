// WebSocket Manager — Deep Realtime Streaming for Genova
// Features: Multi-agent feed, advanced token streaming, orchestration events
// Architecture: WSManager → Connection Pool → Event Router → Message Handlers

import type { Server } from 'http';
import { createLogger } from '@/lib/logger';

const log = createLogger('websocket');

// ============================================================
// INTERFACES
// ============================================================

export interface WSMessage {
  type: WSMessageType;
  payload: Record<string, unknown>;
  timestamp: string;
  id: string;
  source: string; // agentId or 'system'
}

export type WSMessageType =
  | 'token'              // Streaming token
  | 'agent_step'         // Agent execution step update
  | 'agent_status'       // Agent status change (active, paused, error)
  | 'orchestration'      // Orchestration event (agent delegation, task assignment)
  | 'thinking'           // Agent thinking/reasoning step
  | 'tool_call'          // Tool invocation
  | 'tool_result'        // Tool execution result
  | 'memory_update'      // Memory store/delete/update
  | 'guardrail_alert'    // Guardrail triggered
  | 'progress'           // Progress update
  | 'error'              // Error event
  | 'heartbeat'          // Keep-alive
  | 'subscribe'          // Client subscribes to agent(s)
  | 'unsubscribe'        // Client unsubscribes from agent(s)
  | 'batch'              // Batch of messages
  | 'connection_ack'     // Server acknowledges connection
  | 'agent_broadcast';   // Broadcast from agent to all subscribers

export interface WSConnection {
  id: string;
  ws: unknown; // WebSocket instance
  userId: string;
  subscribedAgents: Set<string>;
  connectedAt: string;
  lastPingAt: string;
  messagesSent: number;
  messagesReceived: number;
  healthy: boolean;
  buffer: WSMessage[];
}

export interface AgentFeedEvent {
  agentId: string;
  agentName: string;
  event: 'thinking' | 'acting' | 'observing' | 'reflecting' | 'completed' | 'error' | 'paused';
  data: Record<string, unknown>;
  step?: number;
  totalSteps?: number;
}

export interface OrchestrationEvent {
  type: 'delegate' | 'assign' | 'complete' | 'fail' | 'retry' | 'coordinate';
  fromAgentId: string;
  toAgentId?: string;
  task: string;
  result?: unknown;
  metadata?: Record<string, unknown>;
}

// ============================================================
// MESSAGE BUILDER
// ============================================================

let messageCounter = 0;

export function createMessage(type: WSMessageType, payload: Record<string, unknown>, source: string = 'system'): WSMessage {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
    id: `ws_${Date.now()}_${++messageCounter}`,
    source,
  };
}

// ============================================================
// WEBSOCKET MANAGER (Server-side, works with Next.js custom server)
// ============================================================

export class WebSocketManager {
  private connections: Map<string, WSConnection> = new Map();
  private agentSubscribers: Map<string, Set<string>> = new Map(); // agentId → Set of connectionIds
  private messageHandlers: Map<WSMessageType, Array<(msg: WSMessage, conn: WSConnection) => void>> = new Map();
  private heartbeatIntervalMs: number = 15000;
  private maxBufferSize: number = 50;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: { heartbeatIntervalMs?: number; maxBufferSize?: number }) {
    if (options?.heartbeatIntervalMs) this.heartbeatIntervalMs = options.heartbeatIntervalMs;
    if (options?.maxBufferSize) this.maxBufferSize = options.maxBufferSize;
  }

  // ============================================================
  // CONNECTION MANAGEMENT
  // ============================================================

  /**
   * Register a new WebSocket connection
   */
  registerConnection(connectionId: string, userId: string, ws: unknown): void {
    const connection: WSConnection = {
      id: connectionId,
      ws,
      userId,
      subscribedAgents: new Set(),
      connectedAt: new Date().toISOString(),
      lastPingAt: new Date().toISOString(),
      messagesSent: 0,
      messagesReceived: 0,
      healthy: true,
      buffer: [],
    };

    this.connections.set(connectionId, connection);

    // Send connection acknowledgment
    this.sendToConnection(connectionId, createMessage('connection_ack', {
      connectionId,
      serverTime: new Date().toISOString(),
      features: ['multi_agent_feed', 'token_streaming', 'orchestration', 'subscribe'],
    }));
  }

  /**
   * Unregister a WebSocket connection
   */
  unregisterConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from all agent subscriber lists
    for (const agentId of connection.subscribedAgents) {
      const subscribers = this.agentSubscribers.get(agentId);
      if (subscribers) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.agentSubscribers.delete(agentId);
        }
      }
    }

    this.connections.delete(connectionId);
  }

  // ============================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================

  /**
   * Subscribe a connection to an agent's feed
   */
  subscribeToAgent(connectionId: string, agentId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.subscribedAgents.add(agentId);

    if (!this.agentSubscribers.has(agentId)) {
      this.agentSubscribers.set(agentId, new Set());
    }
    this.agentSubscribers.get(agentId)!.add(connectionId);

    // Confirm subscription
    this.sendToConnection(connectionId, createMessage('subscribe', {
      agentId,
      status: 'subscribed',
    }));
  }

  /**
   * Unsubscribe a connection from an agent's feed
   */
  unsubscribeFromAgent(connectionId: string, agentId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.subscribedAgents.delete(agentId);

    const subscribers = this.agentSubscribers.get(agentId);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.agentSubscribers.delete(agentId);
      }
    }
  }

  // ============================================================
  // MESSAGE SENDING
  // ============================================================

  /**
   * Send a message to a specific connection
   * FIX (Bug #4): Original code was a no-op — it only incremented the counter
   * without actually sending data via WebSocket. Now properly serializes and sends.
   * Also handles WebSocket readyState checks and proper error recovery.
   */
  sendToConnection(connectionId: string, message: WSMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    if (!connection.healthy) {
      // Buffer for retry when connection recovers
      if (connection.buffer.length < this.maxBufferSize) {
        connection.buffer.push(message);
      }
      return false;
    }

    try {
      // Access the real WebSocket instance
      const ws = connection.ws as { readyState?: number; send?: (data: string) => void } | null;

      // Check WebSocket readyState: 1 = OPEN (ready to send)
      if (ws && typeof ws.send === 'function' && ws.readyState === 1) {
        ws.send(JSON.stringify(message));
        connection.messagesSent++;
        connection.lastPingAt = new Date().toISOString();

        // Flush buffered messages if any
        while (connection.buffer.length > 0) {
          const buffered = connection.buffer.shift()!;
          try {
            ws.send(JSON.stringify(buffered));
            connection.messagesSent++;
          } catch {
            // Re-buffer on partial failure
            connection.buffer.unshift(buffered);
            break;
          }
        }

        return true;
      } else {
        // WebSocket not in OPEN state — buffer the message
        connection.healthy = false;
        if (connection.buffer.length < this.maxBufferSize) {
          connection.buffer.push(message);
        }
        return false;
      }
    } catch (error) {
      connection.healthy = false;
      if (connection.buffer.length < this.maxBufferSize) {
        connection.buffer.push(message);
      }
      log.error('Error sending to connection', { connectionId, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Broadcast a message to all subscribers of an agent
   */
  broadcastToAgentSubscribers(agentId: string, message: WSMessage): number {
    const subscribers = this.agentSubscribers.get(agentId);
    if (!subscribers) return 0;

    let sent = 0;
    for (const connId of subscribers) {
      if (this.sendToConnection(connId, message)) {
        sent++;
      }
    }
    return sent;
  }

  /**
   * Broadcast a message to all connections for a user
   */
  broadcastToUser(userId: string, message: WSMessage): number {
    let sent = 0;
    for (const [connId, conn] of this.connections.entries()) {
      if (conn.userId === userId) {
        if (this.sendToConnection(connId, message)) {
          sent++;
        }
      }
    }
    return sent;
  }

  // ============================================================
  // AGENT FEED — Live multi-agent event stream
  // ============================================================

  /**
   * Send an agent step event to all subscribers
   */
  sendAgentStep(event: AgentFeedEvent): number {
    const message = createMessage('agent_step', {
      agentId: event.agentId,
      agentName: event.agentName,
      event: event.event,
      data: event.data,
      step: event.step,
      totalSteps: event.totalSteps,
    }, event.agentId);

    return this.broadcastToAgentSubscribers(event.agentId, message);
  }

  /**
   * Send an agent status change
   */
  sendAgentStatus(agentId: string, status: string, metadata?: Record<string, unknown>): number {
    const message = createMessage('agent_status', {
      agentId,
      status,
      metadata,
    }, agentId);

    return this.broadcastToAgentSubscribers(agentId, message);
  }

  /**
   * Send a thinking event from an agent
   */
  sendAgentThinking(agentId: string, thought: string, confidence?: number): number {
    const message = createMessage('thinking', {
      agentId,
      thought,
      confidence,
    }, agentId);

    return this.broadcastToAgentSubscribers(agentId, message);
  }

  // ============================================================
  // ORCHESTRATION — Agent coordination events
  // ============================================================

  /**
   * Send an orchestration event (agent delegation, task assignment, etc.)
   */
  sendOrchestrationEvent(event: OrchestrationEvent): number {
    const message = createMessage('orchestration', {
      type: event.type,
      fromAgentId: event.fromAgentId,
      toAgentId: event.toAgentId,
      task: event.task,
      result: event.result,
      metadata: event.metadata,
    }, event.fromAgentId);

    // Broadcast to subscribers of both agents
    let sent = this.broadcastToAgentSubscribers(event.fromAgentId, message);
    if (event.toAgentId) {
      sent += this.broadcastToAgentSubscribers(event.toAgentId, message);
    }
    return sent;
  }

  // ============================================================
  // TOKEN STREAMING — Advanced low-latency token delivery
  // ============================================================

  /**
   * Stream a token to all subscribers of an agent
   */
  streamToken(agentId: string, token: string, metadata?: Record<string, unknown>): number {
    const message = createMessage('token', {
      agentId,
      token,
      ...metadata,
    }, agentId);

    return this.broadcastToAgentSubscribers(agentId, message);
  }

  /**
   * Stream a batch of tokens for smoother rendering
   */
  streamTokenBatch(agentId: string, tokens: Array<{ token: string; metadata?: Record<string, unknown> }>): number {
    const message = createMessage('batch', {
      agentId,
      tokens,
      count: tokens.length,
    }, agentId);

    return this.broadcastToAgentSubscribers(agentId, message);
  }

  // ============================================================
  // TOOL & MEMORY EVENTS
  // ============================================================

  /**
   * Send a tool call event
   */
  sendToolCall(agentId: string, toolName: string, input: Record<string, unknown>): number {
    const message = createMessage('tool_call', {
      agentId,
      toolName,
      input,
    }, agentId);

    return this.broadcastToAgentSubscribers(agentId, message);
  }

  /**
   * Send a tool result event
   */
  sendToolResult(agentId: string, toolName: string, result: unknown, duration: number): number {
    const message = createMessage('tool_result', {
      agentId,
      toolName,
      result,
      duration,
    }, agentId);

    return this.broadcastToAgentSubscribers(agentId, message);
  }

  /**
   * Send a memory update event
   */
  sendMemoryUpdate(agentId: string, action: string, memoryId: string, content?: string): number {
    const message = createMessage('memory_update', {
      agentId,
      action, // 'store', 'delete', 'update'
      memoryId,
      contentPreview: content ? content.substring(0, 100) : undefined,
    }, agentId);

    return this.broadcastToAgentSubscribers(agentId, message);
  }

  /**
   * Send a guardrail alert
   */
  sendGuardrailAlert(agentId: string, guardrailName: string, severity: string, reason: string): number {
    const message = createMessage('guardrail_alert', {
      agentId,
      guardrailName,
      severity,
      reason,
    }, 'system');

    return this.broadcastToAgentSubscribers(agentId, message);
  }

  // ============================================================
  // MESSAGE HANDLING
  // ============================================================

  /**
   * Register a message handler for a specific message type
   */
  onMessage(type: WSMessageType, handler: (msg: WSMessage, conn: WSConnection) => void): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  /**
   * Process an incoming message from a client
   */
  handleMessage(connectionId: string, rawMessage: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.messagesReceived++;

    try {
      const message: WSMessage = JSON.parse(rawMessage);

      // Handle built-in message types
      switch (message.type) {
        case 'heartbeat':
          connection.lastPingAt = new Date().toISOString();
          this.sendToConnection(connectionId, createMessage('heartbeat', { serverTime: new Date().toISOString() }));
          break;

        case 'subscribe':
          if (message.payload.agentId && typeof message.payload.agentId === 'string') {
            this.subscribeToAgent(connectionId, message.payload.agentId);
          }
          break;

        case 'unsubscribe':
          if (message.payload.agentId && typeof message.payload.agentId === 'string') {
            this.unsubscribeFromAgent(connectionId, message.payload.agentId);
          }
          break;
      }

      // Call registered handlers
      const handlers = this.messageHandlers.get(message.type);
      if (handlers) {
        for (const handler of handlers) {
          handler(message, connection);
        }
      }
    } catch (error) {
      // Invalid message format — log for debugging instead of silently swallowing
      log.warn('Invalid message from connection', { connectionId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // ============================================================
  // HEALTH & CLEANUP
  // ============================================================

  /**
   * Start the heartbeat timer
   * FIX (Bug #4): Original iterated `this.connections` with `for...of` and called
   * `unregisterConnection()` inside the loop — mutating a Map while iterating causes
   * undefined behavior / crash. Now collects stale IDs first, then unregisters after.
   */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      const staleConnectionIds: string[] = [];

      for (const [id, conn] of this.connections.entries()) {
        const timeSincePing = Date.now() - new Date(conn.lastPingAt).getTime();
        if (timeSincePing > 60000) { // 60s without ping
          conn.healthy = false;
          staleConnectionIds.push(id);
        } else {
          this.sendToConnection(id, createMessage('heartbeat', { serverTime: new Date().toISOString() }));
        }
      }

      // Unregister stale connections after iteration completes
      for (const id of staleConnectionIds) {
        this.unregisterConnection(id);
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop the heartbeat timer
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    healthyConnections: number;
    totalSubscriptions: number;
    activeAgents: number;
    totalMessagesSent: number;
    totalMessagesReceived: number;
  } {
    let totalSent = 0;
    let totalReceived = 0;
    let healthy = 0;

    for (const conn of this.connections.values()) {
      totalSent += conn.messagesSent;
      totalReceived += conn.messagesReceived;
      if (conn.healthy) healthy++;
    }

    return {
      totalConnections: this.connections.size,
      healthyConnections: healthy,
      totalSubscriptions: Array.from(this.agentSubscribers.values()).reduce((sum, s) => sum + s.size, 0),
      activeAgents: this.agentSubscribers.size,
      totalMessagesSent: totalSent,
      totalMessagesReceived: totalReceived,
    };
  }

  /**
   * Clean up stale connections
   */
  cleanup(maxAgeMs: number = 300000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;

    // Collect stale IDs first to avoid modifying Map during iteration
    const staleIds: string[] = [];
    for (const [id, conn] of this.connections.entries()) {
      if (new Date(conn.lastPingAt).getTime() < cutoff || !conn.healthy) {
        staleIds.push(id);
      }
    }
    for (const id of staleIds) {
      this.unregisterConnection(id);
      cleaned++;
    }

    return cleaned;
  }

  /**
   * Destroy the manager
   */
  destroy(): void {
    this.stopHeartbeat();
    // Collect IDs first to avoid modifying Map during iteration
    const ids = Array.from(this.connections.keys());
    for (const id of ids) {
      this.unregisterConnection(id);
    }
  }
}

// Singleton
let globalWSManager: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager {
  if (!globalWSManager) {
    globalWSManager = new WebSocketManager();
  }
  return globalWSManager;
}
