/**
 * AI Calls — Make and receive phone calls powered by AI
 *
 * Uses Twilio / WhatsApp for telephony + Voice Agent for conversation.
 * Features:
 *   - Initiate outbound AI-powered calls
 *   - Handle incoming call webhooks
 *   - Real-time audio processing during calls
 *   - Call recording and transcription
 *   - Call status tracking
 */

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { SpeechToTextEngine } from '@/lib/voice/stt';
import { TextToSpeechEngine } from '@/lib/voice/tts';
import { createAIRouter } from '@/lib/ai-router';
import { VoiceMemorySystem } from '@/lib/voice/voice-memory';

const log = createLogger('ai-calls');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AICallConfig {
  provider: 'twilio' | 'whatsapp';
  fromNumber: string;
  toNumber: string;
  agentId: string;
  language: string;
  maxDurationMinutes: number;
  recordingEnabled: boolean;
}

export interface AICallSession {
  id: string;
  config: AICallConfig;
  status: 'ringing' | 'connected' | 'ended' | 'failed';
  startedAt: string;
  endedAt?: string;
  recordingUrl?: string;
  transcript: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

// ---------------------------------------------------------------------------
// In-memory active calls store
// ---------------------------------------------------------------------------

const activeCalls = new Map<string, AICallSession>();

// ---------------------------------------------------------------------------
// Twilio Integration
// ---------------------------------------------------------------------------

async function initiateTwilioCall(
  callId: string,
  config: AICallConfig,
): Promise<{ callSid: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = config.fromNumber;

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    // Create Twilio call
    const twimlUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/voice/calls/twiml?callId=${callId}`;

    const formData = new URLSearchParams();
    formData.append('To', config.toNumber);
    formData.append('From', twilioPhoneNumber);
    formData.append('Url', twimlUrl);
    formData.append('Timeout', '30');

    if (config.recordingEnabled) {
      formData.append('Record', 'true');
      formData.append('RecordingStatusCallback', `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/voice/calls/recording?callId=${callId}`);
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Twilio call initiation failed: ${res.status} — ${errBody}`);
    }

    const data = await res.json();

    return { callSid: data.sid };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// WhatsApp Call Integration
// ---------------------------------------------------------------------------

async function initiateWhatsAppCall(
  callId: string,
  config: AICallConfig,
): Promise<{ callSid: string }> {
  // WhatsApp doesn't natively support voice calls via API
  // We use WhatsApp Business API for voice messages as a workaround
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_API_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp credentials not configured (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_TOKEN)');
  }

  // Create a call record — actual call handling is via WhatsApp voice messages
  const callSid = `wa_${callId}`;

  log.info('WhatsApp call session initiated', { callId, callSid });

  return { callSid };
}

// ---------------------------------------------------------------------------
// AICallSystem class
// ---------------------------------------------------------------------------

export class AICallSystem {
  /**
   * Initiate an AI-powered call
   */
  async initiateCall(
    config: AICallConfig,
    userId: string,
  ): Promise<AICallSession> {
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const session: AICallSession = {
      id: callId,
      config,
      status: 'ringing',
      startedAt: new Date().toISOString(),
      transcript: [],
    };

    // Persist to database
    try {
      await db.voiceCall.create({
        data: {
          id: callId,
          userId,
          agentId: config.agentId,
          provider: config.provider,
          fromNumber: config.fromNumber,
          toNumber: config.toNumber,
          status: 'ringing',
          language: config.language,
          maxDurationMinutes: config.maxDurationMinutes,
          recordingEnabled: config.recordingEnabled,
          metadata: JSON.stringify({ initiatedBy: userId }),
        },
      });
    } catch (error) {
      log.warn('Failed to persist call session', { error: String(error) });
    }

    // Initiate the actual call via the provider
    try {
      const result = config.provider === 'twilio'
        ? await initiateTwilioCall(callId, config)
        : await initiateWhatsAppCall(callId, config);

      // Update with call SID
      await db.voiceCall.update({
        where: { id: callId },
        data: { callSid: result.callSid },
      }).catch(() => {});

      log.info('AI call initiated', {
        callId,
        provider: config.provider,
        callSid: result.callSid,
        to: config.toNumber,
      });
    } catch (error) {
      log.error('Failed to initiate call', { error: String(error) });

      // Update status to failed
      session.status = 'failed';
      await db.voiceCall.update({
        where: { id: callId },
        data: { status: 'failed', metadata: JSON.stringify({ error: String(error) }) },
      }).catch(() => {});

      throw error;
    }

    activeCalls.set(callId, session);
    return session;
  }

  /**
   * Handle incoming call webhook
   */
  async handleIncomingCall(
    callSid: string,
    from: string,
    to: string,
  ): Promise<AICallSession> {
    const callId = `call_incoming_${Date.now()}`;

    const session: AICallSession = {
      id: callId,
      config: {
        provider: 'twilio',
        fromNumber: from,
        toNumber: to,
        agentId: 'default',
        language: 'en-US',
        maxDurationMinutes: 30,
        recordingEnabled: false,
      },
      status: 'connected',
      startedAt: new Date().toISOString(),
      transcript: [],
    };

    // Persist to database
    try {
      await db.voiceCall.create({
        data: {
          id: callId,
          userId: 'system', // Will be linked to actual user later
          provider: 'twilio',
          fromNumber: from,
          toNumber: to,
          status: 'connected',
          callSid,
          metadata: JSON.stringify({ direction: 'inbound' }),
        },
      });
    } catch (error) {
      log.warn('Failed to persist incoming call', { error: String(error) });
    }

    activeCalls.set(callId, session);

    log.info('Incoming call handled', { callId, callSid, from, to });

    return session;
  }

  /**
   * Process audio from an active call: STT → AI → TTS → response audio
   */
  async processCallAudio(
    callId: string,
    audioChunk: Buffer,
    userId: string,
  ): Promise<Buffer | null> {
    const session = activeCalls.get(callId);

    if (!session) {
      log.warn('Process audio called for unknown call', { callId });
      return null;
    }

    if (session.status !== 'connected') {
      return null;
    }

    try {
      // Step 1: STT
      const stt = new SpeechToTextEngine(userId);
      const sttResult = await stt.transcribe(audioChunk, {
        language: session.config.language,
      });

      const userText = sttResult.text.trim();
      if (!userText) return null;

      // Add to transcript
      session.transcript.push({
        role: 'user',
        content: userText,
        timestamp: new Date().toISOString(),
      });

      // Step 2: AI response
      const router = createAIRouter(userId);
      const messages = [
        {
          role: 'system' as const,
          content: `You are an AI phone assistant handling a call. Keep responses brief and conversational. Language: ${session.config.language}. You are speaking on the phone, so be natural and concise.`,
        },
        ...session.transcript.slice(-8).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ];

      const aiResponse = await router.chat(messages, { model: 'fast' });

      session.transcript.push({
        role: 'assistant',
        content: aiResponse.content,
        timestamp: new Date().toISOString(),
      });

      // Step 3: TTS
      const tts = new TextToSpeechEngine(userId);
      const ttsResult = await tts.synthesize(aiResponse.content, {
        language: session.config.language,
        speed: 1.0,
      });

      // Update transcript in database
      await db.voiceCall.update({
        where: { id: callId },
        data: {
          transcript: JSON.stringify(session.transcript),
        },
      }).catch(() => {});

      return ttsResult.audioBuffer;
    } catch (error) {
      log.error('Failed to process call audio', { callId, error: String(error) });
      return null;
    }
  }

  /**
   * End an active call
   */
  async endCall(callId: string): Promise<void> {
    const session = activeCalls.get(callId);

    if (!session) {
      log.warn('End call called for unknown call', { callId });
      return;
    }

    session.status = 'ended';
    session.endedAt = new Date().toISOString();

    // Calculate duration
    const startTime = new Date(session.startedAt).getTime();
    const endTime = new Date(session.endedAt).getTime();
    const durationSeconds = Math.round((endTime - startTime) / 1000);

    // Update database
    try {
      await db.voiceCall.update({
        where: { id: callId },
        data: {
          status: 'ended',
          endedAt: new Date(),
          durationSeconds,
          transcript: JSON.stringify(session.transcript),
        },
      });
    } catch (error) {
      log.warn('Failed to update call on end', { error: String(error) });
    }

    // Save to voice memory
    if (session.transcript.length > 0) {
      try {
        const memory = new VoiceMemorySystem('system');
        const transcriptText = session.transcript
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n');

        await memory.storeMemory('system', transcriptText, undefined, {
          type: 'conversation',
          callId,
          provider: session.config.provider,
          durationSeconds,
        });
      } catch (error) {
        log.warn('Failed to save call memory', { error: String(error) });
      }
    }

    activeCalls.delete(callId);

    log.info('AI call ended', {
      callId,
      durationSeconds,
      turnCount: session.transcript.length,
    });
  }

  /**
   * Get call status
   */
  async getCallStatus(callId: string): Promise<AICallSession> {
    const activeSession = activeCalls.get(callId);
    if (activeSession) return activeSession;

    // Fall back to database
    const dbCall = await db.voiceCall.findUnique({
      where: { id: callId },
    });

    if (!dbCall) {
      throw new Error(`Call ${callId} not found`);
    }

    return {
      id: dbCall.id,
      config: {
        provider: dbCall.provider as 'twilio' | 'whatsapp',
        fromNumber: dbCall.fromNumber,
        toNumber: dbCall.toNumber,
        agentId: dbCall.agentId ?? 'default',
        language: dbCall.language,
        maxDurationMinutes: dbCall.maxDurationMinutes,
        recordingEnabled: dbCall.recordingEnabled,
      },
      status: dbCall.status as AICallSession['status'],
      startedAt: dbCall.startedAt.toISOString(),
      endedAt: dbCall.endedAt?.toISOString(),
      recordingUrl: dbCall.recordingUrl ?? undefined,
      transcript: JSON.parse(dbCall.transcript || '[]'),
    };
  }

  /**
   * List calls for a user
   */
  async listCalls(
    userId: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ calls: AICallSession[]; total: number }> {
    const { status, limit = 20, offset = 0 } = options;

    try {
      const where = {
        userId,
        ...(status ? { status } : {}),
      };

      const [calls, total] = await Promise.all([
        db.voiceCall.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        db.voiceCall.count({ where }),
      ]);

      return {
        calls: calls.map((c) => ({
          id: c.id,
          config: {
            provider: c.provider as 'twilio' | 'whatsapp',
            fromNumber: c.fromNumber,
            toNumber: c.toNumber,
            agentId: c.agentId ?? 'default',
            language: c.language,
            maxDurationMinutes: c.maxDurationMinutes,
            recordingEnabled: c.recordingEnabled,
          },
          status: c.status as AICallSession['status'],
          startedAt: c.startedAt.toISOString(),
          endedAt: c.endedAt?.toISOString(),
          recordingUrl: c.recordingUrl ?? undefined,
          transcript: JSON.parse(c.transcript || '[]'),
        })),
        total,
      };
    } catch (error) {
      log.error('Failed to list calls', { error: String(error) });
      return { calls: [], total: 0 };
    }
  }
}
