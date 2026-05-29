/**
 * Voice Agent — Real-time conversational AI with voice
 *
 * Combines STT + AI Router + TTS for full voice conversations.
 * Features:
 *   - Interruption handling (barge-in)
 *   - Voice activity detection (VAD)
 *   - Multi-turn conversation with context
 *   - Session persistence & voice memory integration
 */

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { SpeechToTextEngine, type STTResult } from '@/lib/voice/stt';
import { TextToSpeechEngine, type TTSOptions } from '@/lib/voice/tts';
import { createAIRouter } from '@/lib/ai-router';
import { VoiceMemorySystem } from '@/lib/voice/voice-memory';

const log = createLogger('voice-agent');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceAgentConfig {
  agentId: string;
  voiceProfileId?: string;
  language: string;
  enableInterruption: boolean;
  vadSensitivity: 'low' | 'medium' | 'high';
  responseDelayMs: number;
}

export interface VoiceAgentSession {
  id: string;
  agentId: string;
  userId: string;
  status: 'listening' | 'thinking' | 'speaking' | 'idle';
  startedAt: string;
  transcript: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

interface VoiceProfileData {
  voiceModel: string;
  speed: number;
  pitch: number;
  provider: string;
  language: string;
}

// ---------------------------------------------------------------------------
// Voice Activity Detection (simple energy-based)
// ---------------------------------------------------------------------------

function detectVoiceActivity(
  audioChunk: Buffer,
  sensitivity: 'low' | 'medium' | 'high',
): boolean {
  if (audioChunk.length < 2) return false;

  // Calculate RMS energy of 16-bit PCM audio
  let sumSquares = 0;
  const samples = Math.floor(audioChunk.length / 2);
  for (let i = 0; i < samples; i++) {
    const sample = audioChunk.readInt16LE(i * 2);
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / samples);

  // Thresholds based on sensitivity
  const thresholds = {
    low: 200,     // Needs loud speech
    medium: 100,  // Normal speech
    high: 40,     // Soft speech detected
  };

  return rms > thresholds[sensitivity];
}

// ---------------------------------------------------------------------------
// In-memory session store
// ---------------------------------------------------------------------------

const activeSessions = new Map<string, VoiceAgentSession>();
const sessionConfigs = new Map<string, VoiceAgentConfig>();

// ---------------------------------------------------------------------------
// VoiceAgent class
// ---------------------------------------------------------------------------

export class VoiceAgent {
  private stt: SpeechToTextEngine;
  private tts: TextToSpeechEngine;
  private memory: VoiceMemorySystem;

  constructor(userId: string) {
    this.stt = new SpeechToTextEngine(userId);
    this.tts = new TextToSpeechEngine(userId);
    this.memory = new VoiceMemorySystem(userId);
  }

  /**
   * Start a new voice agent session
   */
  async startSession(
    config: VoiceAgentConfig,
    userId: string,
  ): Promise<VoiceAgentSession> {
    const sessionId = `va_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const session: VoiceAgentSession = {
      id: sessionId,
      agentId: config.agentId,
      userId,
      status: 'idle',
      startedAt: new Date().toISOString(),
      transcript: [],
    };

    activeSessions.set(sessionId, session);
    sessionConfigs.set(sessionId, config);

    // Persist session to database
    try {
      await db.voiceSession.create({
        data: {
          id: sessionId,
          userId,
          agentId: config.agentId,
          type: 'bidirectional',
          status: 'active',
          language: config.language,
          sttProvider: 'auto',
          ttsProvider: 'auto',
          metadata: JSON.stringify({
            vadSensitivity: config.vadSensitivity,
            enableInterruption: config.enableInterruption,
            responseDelayMs: config.responseDelayMs,
          }),
        },
      });
    } catch (error) {
      log.warn('Failed to persist voice session', { error: String(error) });
    }

    log.info('Voice agent session started', { sessionId, agentId: config.agentId });

    return session;
  }

  /**
   * Process incoming audio: STT → AI → TTS → response audio
   */
  async processAudio(
    sessionId: string,
    audioChunk: Buffer,
  ): Promise<Buffer | null> {
    const session = activeSessions.get(sessionId);
    const config = sessionConfigs.get(sessionId);

    if (!session || !config) {
      log.warn('Process audio called for unknown session', { sessionId });
      return null;
    }

    // Voice activity detection
    if (!detectVoiceActivity(audioChunk, config.vadSensitivity)) {
      return null; // Silence detected, skip
    }

    // Check for interruption (barge-in during speaking)
    if (session.status === 'speaking' && config.enableInterruption) {
      log.info('Barge-in detected, interrupting current speech', { sessionId });
      session.status = 'listening';
    }

    // Step 1: STT — transcribe the audio
    session.status = 'listening';

    let sttResult: STTResult;
    try {
      sttResult = await this.stt.transcribe(audioChunk, {
        language: config.language,
      });
    } catch (error) {
      log.error('STT failed during voice agent processing', { error: String(error) });
      session.status = 'idle';
      return null;
    }

    const userText = sttResult.text.trim();
    if (!userText) {
      session.status = 'idle';
      return null;
    }

    // Add user message to transcript
    session.transcript.push({
      role: 'user',
      content: userText,
      timestamp: new Date().toISOString(),
    });

    // Step 2: AI — generate response
    session.status = 'thinking';

    let aiResponse: string;
    try {
      const router = createAIRouter(session.userId);

      // Build conversation history for context
      const messages = [
        {
          role: 'system' as const,
          content: this.buildSystemPrompt(config),
        },
        // Include recent transcript for context (last 10 turns)
        ...session.transcript.slice(-10).map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      ];

      const response = await router.chat(messages, { model: 'fast' });
      aiResponse = response.content;
    } catch (error) {
      log.error('AI generation failed during voice agent processing', { error: String(error) });
      session.status = 'idle';
      return null;
    }

    // Add assistant message to transcript
    session.transcript.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
    });

    // Step 3: TTS — synthesize the response
    session.status = 'speaking';

    // Apply optional delay before speaking
    if (config.responseDelayMs > 0) {
      await new Promise((r) => setTimeout(r, config.responseDelayMs));
    }

    try {
      const voiceOptions = await this.getVoiceOptions(config);
      const ttsResult = await this.tts.synthesize(aiResponse, voiceOptions);

      session.status = 'idle';
      return ttsResult.audioBuffer;
    } catch (error) {
      log.error('TTS failed during voice agent processing', { error: String(error) });
      session.status = 'idle';
      return null;
    }
  }

  /**
   * End session and save voice memory
   */
  async endSession(sessionId: string): Promise<void> {
    const session = activeSessions.get(sessionId);

    if (!session) {
      log.warn('End session called for unknown session', { sessionId });
      return;
    }

    // Save full transcript as voice memory
    if (session.transcript.length > 0) {
      try {
        const transcriptText = session.transcript
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n');

        await this.memory.storeMemory(
          session.userId,
          transcriptText,
          undefined,
          {
            sessionId,
            agentId: session.agentId,
            type: 'conversation',
            turnCount: session.transcript.length,
          },
        );
      } catch (error) {
        log.warn('Failed to save voice memory on session end', { error: String(error) });
      }
    }

    // Update database session
    try {
      await db.voiceSession.update({
        where: { id: sessionId },
        data: {
          status: 'ended',
          transcription: session.transcript.map((m) => `${m.role}: ${m.content}`).join('\n'),
          endedAt: new Date(),
          metadata: JSON.stringify({
            turnCount: session.transcript.length,
          }),
        },
      });
    } catch (error) {
      log.warn('Failed to update voice session on end', { error: String(error) });
    }

    // Remove from active sessions
    activeSessions.delete(sessionId);
    sessionConfigs.delete(sessionId);

    log.info('Voice agent session ended', {
      sessionId,
      turnCount: session.transcript.length,
    });
  }

  /**
   * Get current session state
   */
  getSession(sessionId: string): VoiceAgentSession | null {
    return activeSessions.get(sessionId) ?? null;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildSystemPrompt(config: VoiceAgentConfig): string {
    return `You are a voice AI assistant. You communicate through voice, so keep your responses:
- Concise and natural (avoid long paragraphs)
- Conversational (use contractions, natural speech patterns)
- Direct (answer the question directly)

Language: ${config.language}
Agent ID: ${config.agentId}

Respond as if you are speaking to someone in real-time. Avoid markdown formatting, bullet points, or numbered lists — speak naturally.`;
  }

  private async getVoiceOptions(config: VoiceAgentConfig): Promise<TTSOptions> {
    const defaults: TTSOptions = {
      voice: 'alloy',
      speed: 1.0,
      responseFormat: 'mp3',
      language: config.language,
    };

    // Load user's voice profile if specified
    if (config.voiceProfileId) {
      try {
        const profile = await db.voiceProfile.findUnique({
          where: { id: config.voiceProfileId },
        });

        if (profile) {
          return {
            voice: profile.voiceModel,
            speed: profile.speed,
            responseFormat: 'mp3',
            language: profile.language,
          };
        }
      } catch {
        // Fall through to defaults
      }
    }

    return defaults;
  }
}
