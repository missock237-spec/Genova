/**
 * Avatar Session — Real-time avatar conversation sessions
 *
 * Combines avatar + voice + AI for interactive talking avatars.
 * Manages session lifecycle, input processing, frame rendering,
 * and conversation state.
 */

import { db } from '@/lib/db';
import { createAvatarEngine, type AvatarConfig, type AvatarExpression, type AvatarRenderFrame } from './avatar-engine';
import { createTTSEngine } from '@/lib/voice';

// ============================================================
// Types
// ============================================================

export type SessionStatus = 'active' | 'speaking' | 'idle' | 'ended' | 'error';

export interface AvatarSessionState {
  id: string;
  userId: string;
  avatarConfigId: string | null;
  agentId: string | null;
  status: SessionStatus;
  lipSyncData: Record<string, unknown>;
  speechText: string;
  audioUrl: string | null;
  videoUrl: string | null;
  durationMs: number;
  metadata: Record<string, unknown>;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionInput {
  type: 'text' | 'audio' | 'expression';
  content: string;
  language?: string;
}

export interface SessionOutput {
  text: string;
  audioUrl?: string;
  frames: AvatarRenderFrame[];
  expression: AvatarExpression;
  durationMs: number;
}

export interface ConversationMessage {
  role: 'user' | 'avatar' | 'system';
  content: string;
  timestamp: number;
  expression?: AvatarExpression;
}

// ============================================================
// Avatar Session Engine
// ============================================================

export class AvatarSessionEngine {
  private userId: string;
  private sessionId: string | null = null;
  private avatar: AvatarConfig | null = null;
  private conversationHistory: ConversationMessage[] = [];
  private frameBuffer: AvatarRenderFrame[] = [];
  private isSpeaking = false;
  private speakQueue: string[] = [];

  constructor(userId: string) {
    this.userId = userId;
  }

  // ----------------------------------------------------------
  // Start Session
  // ----------------------------------------------------------
  async startSession(params: {
    avatarConfigId?: string;
    agentId?: string;
    config?: Record<string, unknown>;
  }): Promise<AvatarSessionState> {
    // Load avatar config if provided
    if (params.avatarConfigId) {
      const engine = createAvatarEngine(this.userId);
      this.avatar = await engine.getAvatar(params.avatarConfigId);
      if (!this.avatar) throw new Error('Avatar configuration not found');
    }

    const session = await db.avatarSession.create({
      data: {
        userId: this.userId,
        avatarConfigId: params.avatarConfigId || null,
        agentId: params.agentId || null,
        status: 'active',
        lipSyncData: JSON.stringify({}),
        speechText: '',
        audioUrl: null,
        videoUrl: null,
        durationMs: 0,
        metadata: JSON.stringify({
          config: params.config || {},
          startedBy: 'user',
          version: '1.0',
        }),
      },
    });

    this.sessionId = session.id;
    this.conversationHistory = [];
    this.frameBuffer = [];
    this.isSpeaking = false;

    return this.mapDbToState(session);
  }

  // ----------------------------------------------------------
  // Process Input
  // ----------------------------------------------------------
  async processInput(input: SessionInput): Promise<SessionOutput> {
    if (!this.sessionId) throw new Error('No active session');

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: input.content,
      timestamp: Date.now(),
    });

    // Determine avatar response
    let responseText: string;
    let responseExpression: AvatarExpression = 'neutral';

    if (input.type === 'expression') {
      responseExpression = input.content as AvatarExpression;
      responseText = '';
    } else {
      // Generate AI response (using placeholder logic)
      const result = await this.generateResponse(input.content, input.language);
      responseText = result.text;
      responseExpression = result.expression;
    }

    // Generate lip-sync frames
    const engine = createAvatarEngine(this.userId);
    const lipSync = this.avatar
      ? await engine.generateLipSync(this.avatar.id, responseText, {
          language: input.language,
        })
      : { lipSyncFrames: [], duration: responseText.length * 60, phonemeCount: 0 };

    // Create render frames
    const fps = 30;
    const totalFrames = Math.ceil(lipSync.duration / (1000 / fps));
    const frames: AvatarRenderFrame[] = [];

    for (let i = 0; i < totalFrames; i++) {
      const timestamp = Math.round(i * (1000 / fps));
      const lipFrame = lipSync.lipSyncFrames.find(
        (f) => Math.abs(f.time - timestamp) < 1000 / fps / 2
      );

      frames.push({
        timestamp,
        expression: i < totalFrames * 0.1 ? 'neutral' : responseExpression,
        mouthShape: lipFrame?.mouthShape || {
          open: 0.05,
          width: 0.5,
          lipRound: 0,
          tongueVisible: false,
          teethVisible: false,
        },
        headRotation: { x: 0, y: 0, z: 0 },
        eyeBlink: 1,
        audioOffset: timestamp,
      });
    }

    // Add avatar message to history
    this.conversationHistory.push({
      role: 'avatar',
      content: responseText,
      timestamp: Date.now(),
      expression: responseExpression,
    });

    // Update session
    await db.avatarSession.update({
      where: { id: this.sessionId },
      data: {
        status: 'speaking',
        speechText: responseText,
        audioUrl: lipSync.audioUrl || null,
        lipSyncData: JSON.stringify({ frames: lipSync.lipSyncFrames.length, phonemes: lipSync.phonemeCount }),
        durationMs: { increment: lipSync.duration },
      },
    });

    this.isSpeaking = true;
    this.frameBuffer = frames;

    // Schedule idle state after speaking
    setTimeout(() => {
      this.setSessionIdle().catch(() => {});
    }, lipSync.duration);

    return {
      text: responseText,
      audioUrl: lipSync.audioUrl,
      frames,
      expression: responseExpression,
      durationMs: lipSync.duration,
    };
  }

  // ----------------------------------------------------------
  // Render Frame
  // ----------------------------------------------------------
  renderFrame(frameIndex: number): string | null {
    if (!this.avatar || frameIndex >= this.frameBuffer.length) return null;

    const engine = createAvatarEngine(this.userId);
    return engine.renderAvatarFrame(this.avatar, this.frameBuffer[frameIndex]);
  }

  // ----------------------------------------------------------
  // End Session
  // ----------------------------------------------------------
  async endSession(): Promise<void> {
    if (!this.sessionId) return;

    await db.avatarSession.update({
      where: { id: this.sessionId },
      data: {
        status: 'ended',
        endedAt: new Date(),
        speechText: '',
      },
    });

    this.sessionId = null;
    this.isSpeaking = false;
    this.frameBuffer = [];
  }

  // ----------------------------------------------------------
  // Get Session State
  // ----------------------------------------------------------
  async getSessionState(sessionId: string): Promise<AvatarSessionState | null> {
    const session = await db.avatarSession.findFirst({
      where: { id: sessionId, userId: this.userId },
    });
    if (!session) return null;
    return this.mapDbToState(session);
  }

  // ----------------------------------------------------------
  // List User Sessions
  // ----------------------------------------------------------
  async listSessions(status?: SessionStatus): Promise<AvatarSessionState[]> {
    const sessions = await db.avatarSession.findMany({
      where: {
        userId: this.userId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((s) => this.mapDbToState(s));
  }

  // ----------------------------------------------------------
  // Get Conversation History
  // ----------------------------------------------------------
  getConversationHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  private async generateResponse(
    inputText: string,
    language?: string
  ): Promise<{ text: string; expression: AvatarExpression }> {
    // Simple response generation logic
    // In production, this would call an LLM
    const lowerInput = inputText.toLowerCase();

    let text: string;
    let expression: AvatarExpression = 'neutral';

    if (lowerInput.includes('hello') || lowerInput.includes('hi') || lowerInput.includes('hey')) {
      text = 'Hello! Nice to meet you. How can I help you today?';
      expression = 'happy';
    } else if (lowerInput.includes('how are you')) {
      text = "I'm doing great, thanks for asking! How about you?";
      expression = 'happy';
    } else if (lowerInput.includes('sad') || lowerInput.includes('sorry') || lowerInput.includes('bad')) {
      text = "I'm sorry to hear that. Is there anything I can do to help?";
      expression = 'sad';
    } else if (lowerInput.includes('angry') || lowerInput.includes('frustrated')) {
      text = 'I understand your frustration. Let me help you with that.';
      expression = 'listening';
    } else if (lowerInput.includes('thank')) {
      text = "You're welcome! Happy to help!";
      expression = 'happy';
    } else if (lowerInput.includes('joke') || lowerInput.includes('funny')) {
      text = "Here's something fun: Why don't scientists trust atoms? Because they make up everything!";
      expression = 'laugh';
    } else if (lowerInput.includes('?')) {
      text = "That's a great question! Let me think about that for a moment.";
      expression = 'thinking';
    } else if (lowerInput.includes('bye') || lowerInput.includes('goodbye')) {
      text = 'Goodbye! It was nice talking with you. See you soon!';
      expression = 'wink';
    } else {
      text = `I understand you said: "${inputText}". Let me help you with that.`;
      expression = 'speaking';
    }

    return { text, expression };
  }

  private async setSessionIdle(): Promise<void> {
    if (!this.sessionId) return;
    this.isSpeaking = false;

    await db.avatarSession.update({
      where: { id: this.sessionId },
      data: {
        status: 'idle',
        speechText: '',
      },
    });
  }

  private mapDbToState(session: {
    id: string;
    userId: string;
    avatarConfigId: string | null;
    agentId: string | null;
    status: string;
    lipSyncData: string;
    speechText: string;
    audioUrl: string | null;
    videoUrl: string | null;
    durationMs: number;
    metadata: string;
    startedAt: Date;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): AvatarSessionState {
    return {
      id: session.id,
      userId: session.userId,
      avatarConfigId: session.avatarConfigId,
      agentId: session.agentId,
      status: session.status as SessionStatus,
      lipSyncData: JSON.parse(session.lipSyncData || '{}'),
      speechText: session.speechText,
      audioUrl: session.audioUrl,
      videoUrl: session.videoUrl,
      durationMs: session.durationMs,
      metadata: JSON.parse(session.metadata || '{}'),
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

// ============================================================
// Factory
// ============================================================

export function createAvatarSessionEngine(userId: string): AvatarSessionEngine {
  return new AvatarSessionEngine(userId);
}
