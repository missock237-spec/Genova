/**
 * Multimodal Index — Unified exports for the multimodal system
 *
 * Re-exports all multimodal modules and provides a unified
 * multimodal session manager.
 */

export { VisionEngine, createVisionEngine } from './vision-engine';
export type {
  VisionAnalysisResult,
  DetectedObject,
  ExtractedText,
  TextBlock,
  SceneDescription,
  ComparisonResult,
} from './vision-engine';

export { ScreenShareHandler, createScreenShareHandler } from './screen-share';
export type {
  ScreenFrame,
  ScreenAnalysisResult,
  UIElement,
  ChangeDetection,
  SuggestedAction,
} from './screen-share';

export { WebcamProcessor, createWebcamProcessor } from './webcam-processor';
export type {
  WebcamFrame,
  WebcamAnalysisResult,
  DetectedFace,
  EmotionResult,
  DetectedGesture,
  AttentionResult,
} from './webcam-processor';

import { db } from '@/lib/db';
import { createVisionEngine, type VisionAnalysisResult } from './vision-engine';
import { createScreenShareHandler, type ScreenAnalysisResult } from './screen-share';
import { createWebcamProcessor, type WebcamAnalysisResult } from './webcam-processor';

// ============================================================
// Multimodal Session Manager
// ============================================================

export type MultimodalType = 'vision' | 'webcam' | 'screen_share' | 'audio' | 'multimodal';
export type MultimodalStatus = 'active' | 'paused' | 'ended' | 'error';

export interface MultimodalSessionState {
  id: string;
  userId: string;
  agentId: string | null;
  type: MultimodalType;
  status: MultimodalStatus;
  inputModes: string[];
  outputModes: string[];
  streamUrl: string | null;
  recordings: string[];
  transcript: string;
  durationMs: number;
  frameCount: number;
  metadata: Record<string, unknown>;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class MultimodalSessionManager {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async createSession(params: {
    type: MultimodalType;
    agentId?: string;
    inputModes?: string[];
    outputModes?: string[];
    config?: Record<string, unknown>;
  }): Promise<MultimodalSessionState> {
    const session = await db.multimodalSession.create({
      data: {
        userId: this.userId,
        agentId: params.agentId || null,
        type: params.type,
        status: 'active',
        inputModes: JSON.stringify(params.inputModes || ['video']),
        outputModes: JSON.stringify(params.outputModes || ['text']),
        streamUrl: null,
        recordings: JSON.stringify([]),
        transcript: '',
        durationMs: 0,
        frameCount: 0,
        metadata: JSON.stringify({
          config: params.config || {},
          version: '1.0',
        }),
        endedAt: null,
      },
    });

    return this.mapDbToState(session);
  }

  async getSession(id: string): Promise<MultimodalSessionState | null> {
    const session = await db.multimodalSession.findFirst({
      where: { id, userId: this.userId },
    });
    if (!session) return null;
    return this.mapDbToState(session);
  }

  async listSessions(type?: MultimodalType): Promise<MultimodalSessionState[]> {
    const sessions = await db.multimodalSession.findMany({
      where: {
        userId: this.userId,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((s) => this.mapDbToState(s));
  }

  async endSession(id: string): Promise<void> {
    await db.multimodalSession.update({
      where: { id },
      data: {
        status: 'ended',
        endedAt: new Date(),
      },
    });
  }

  async deleteSession(id: string): Promise<void> {
    await db.multimodalSession.delete({ where: { id } });
  }

  private mapDbToState(session: {
    id: string;
    userId: string;
    agentId: string | null;
    type: string;
    status: string;
    inputModes: string;
    outputModes: string;
    streamUrl: string | null;
    recordings: string;
    transcript: string;
    durationMs: number;
    frameCount: number;
    metadata: string;
    startedAt: Date;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): MultimodalSessionState {
    return {
      id: session.id,
      userId: session.userId,
      agentId: session.agentId,
      type: session.type as MultimodalType,
      status: session.status as MultimodalStatus,
      inputModes: JSON.parse(session.inputModes || '[]'),
      outputModes: JSON.parse(session.outputModes || '[]'),
      streamUrl: session.streamUrl,
      recordings: JSON.parse(session.recordings || '[]'),
      transcript: session.transcript,
      durationMs: session.durationMs,
      frameCount: session.frameCount,
      metadata: JSON.parse(session.metadata || '{}'),
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

export function createMultimodalSessionManager(userId: string): MultimodalSessionManager {
  return new MultimodalSessionManager(userId);
}
