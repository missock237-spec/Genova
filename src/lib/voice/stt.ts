/**
 * Speech-to-Text Engine — Genova Voice AI
 *
 * Multi-provider STT with fallback chain:
 *   1. Groq Whisper (fast, when GROQ_API_KEY set)
 *   2. OpenAI Whisper (high quality, when OPENAI_API_KEY set)
 *   3. z-ai-web-dev-sdk (universal fallback)
 *
 * Features:
 *   - Real-time streaming transcription
 *   - Language auto-detection
 *   - Speaker diarization hints (via segments)
 *   - Confidence scoring
 */

import ZAI from 'z-ai-web-dev-sdk';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('voice-stt');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface STTResult {
  text: string;
  language: string;
  confidence: number;
  duration: number;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

export interface STTOptions {
  language?: string;
  model?: 'whisper-1' | 'whisper-large-v3' | 'distil-whisper-large-v3-en';
  detectLanguage?: boolean;
  enableDiarization?: boolean;
}

// ---------------------------------------------------------------------------
// Provider: Groq Whisper
// ---------------------------------------------------------------------------

async function transcribeGroq(
  audioBuffer: Buffer,
  options: STTOptions,
): Promise<STTResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const model = options.model === 'whisper-large-v3'
    ? 'whisper-large-v3'
    : options.model === 'distil-whisper-large-v3-en'
      ? 'distil-whisper-large-v3-en'
      : 'whisper-large-v3';

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' });
  formData.append('file', blob, 'audio.webm');
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');

  if (options.language) {
    formData.append('language', options.language);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Groq STT error: status ${res.status} — ${errBody}`);
    }

    const data = await res.json();

    return {
      text: data.text ?? '',
      language: data.language ?? options.language ?? 'en',
      confidence: data.segments?.length
        ? data.segments.reduce((s: number, seg: { avg_logprob?: number }) => s + (seg.avg_logprob ?? 0), 0) / data.segments.length
        : 0.85,
      duration: data.duration ?? 0,
      segments: data.segments?.map((seg: { text: string; start: number; end: number; avg_logprob?: number }) => ({
        text: seg.text ?? '',
        start: seg.start ?? 0,
        end: seg.end ?? 0,
        confidence: Math.max(0, Math.min(1, (seg.avg_logprob ?? -0.3) + 1)),
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Provider: OpenAI Whisper
// ---------------------------------------------------------------------------

async function transcribeOpenAI(
  audioBuffer: Buffer,
  options: STTOptions,
): Promise<STTResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' });
  formData.append('file', blob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');

  if (options.language) {
    formData.append('language', options.language);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`OpenAI STT error: status ${res.status} — ${errBody}`);
    }

    const data = await res.json();

    return {
      text: data.text ?? '',
      language: data.language ?? options.language ?? 'en',
      confidence: data.segments?.length
        ? data.segments.reduce((s: number, seg: { avg_logprob?: number }) => s + (seg.avg_logprob ?? 0), 0) / data.segments.length
        : 0.85,
      duration: data.duration ?? 0,
      segments: data.segments?.map((seg: { text: string; start: number; end: number; avg_logprob?: number }) => ({
        text: seg.text ?? '',
        start: seg.start ?? 0,
        end: seg.end ?? 0,
        confidence: Math.max(0, Math.min(1, (seg.avg_logprob ?? -0.3) + 1)),
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Provider: z-ai-web-dev-sdk (ASR fallback)
// ---------------------------------------------------------------------------

async function transcribeZAI(
  audioBuffer: Buffer,
  options: STTOptions,
): Promise<STTResult> {
  try {
    const zai = await ZAI.create();
    const base64Audio = audioBuffer.toString('base64');

    // Use the ASR capability of z-ai-web-dev-sdk
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asr = (zai as any).audio?.asr;
    if (!asr) {
      throw new Error('z-ai-sdk ASR not available');
    }

    const result = await asr.transcribe({
      audio: base64Audio,
      language: options.language || 'en',
    });

    return {
      text: result.text ?? '',
      language: result.language ?? options.language ?? 'en',
      confidence: result.confidence ?? 0.8,
      duration: result.duration ?? 0,
      segments: result.segments?.map((seg: { text: string; start: number; end: number; confidence: number }) => ({
        text: seg.text ?? '',
        start: seg.start ?? 0,
        end: seg.end ?? 0,
        confidence: seg.confidence ?? 0.8,
      })),
    };
  } catch (error) {
    log.error('z-ai-sdk STT fallback failed', { error: String(error) });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// SpeechToTextEngine class
// ---------------------------------------------------------------------------

export class SpeechToTextEngine {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Transcribe an audio buffer.
   * Fallback chain: Groq → OpenAI → z-ai-sdk
   */
  async transcribe(audioBuffer: Buffer, options: STTOptions = {}): Promise<STTResult> {
    const providers = [
      { name: 'groq', fn: () => transcribeGroq(audioBuffer, options) },
      { name: 'openai', fn: () => transcribeOpenAI(audioBuffer, options) },
      { name: 'z-ai-sdk', fn: () => transcribeZAI(audioBuffer, options) },
    ];

    let lastError: unknown;

    for (const provider of providers) {
      try {
        const result = await provider.fn();
        log.info('STT transcription completed', {
          provider: provider.name,
          language: result.language,
          duration: result.duration,
          textLength: result.text.length,
        });

        // Persist session to database
        await this.recordSession(result, options, provider.name);

        return result;
      } catch (error) {
        lastError = error;
        log.warn(`STT provider ${provider.name} failed, trying next`, {
          error: String(error),
        });
      }
    }

    throw lastError ?? new Error('All STT providers failed');
  }

  /**
   * Streaming transcription — yields partial results as audio is processed.
   * Uses chunked approach: accumulate audio and transcribe periodically.
   */
  async *transcribeStream(
    audioStream: AsyncIterable<Buffer>,
    options: STTOptions = {},
  ): AsyncGenerator<STTResult> {
    const CHUNK_DURATION_MS = 3000; // Process every 3 seconds of audio
    const SAMPLE_RATE = 16000;
    const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000; // 16-bit mono
    const CHUNK_SIZE = CHUNK_DURATION_MS * BYTES_PER_MS;

    let buffer = Buffer.alloc(0);

    for await (const chunk of audioStream) {
      buffer = Buffer.concat([buffer, chunk]);

      if (buffer.length >= CHUNK_SIZE) {
        try {
          const result = await this.transcribe(buffer, options);
          yield result;
          buffer = Buffer.alloc(0);
        } catch {
          // Continue accumulating on transient failure
        }
      }
    }

    // Process remaining audio
    if (buffer.length > 0) {
      try {
        const result = await this.transcribe(buffer, options);
        yield result;
      } catch {
        // Final chunk failed
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private: Record STT session to DB
  // -----------------------------------------------------------------------

  private async recordSession(
    result: STTResult,
    options: STTOptions,
    provider: string,
  ): Promise<void> {
    try {
      await db.voiceSession.create({
        data: {
          userId: this.userId,
          type: 'stt',
          status: 'ended',
          language: result.language,
          sttProvider: provider,
          transcription: result.text,
          durationSeconds: Math.round(result.duration),
          metadata: JSON.stringify({
            confidence: result.confidence,
            segments: result.segments?.length ?? 0,
            model: options.model ?? 'default',
            detectLanguage: options.detectLanguage ?? false,
          }),
          endedAt: new Date(),
        },
      });
    } catch (error) {
      log.warn('Failed to record STT session', { error: String(error) });
    }
  }
}
