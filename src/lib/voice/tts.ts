/**
 * Text-to-Speech Engine — Genova Voice AI
 *
 * Multi-provider TTS with fallback chain:
 *   1. OpenAI TTS (high quality, when OPENAI_API_KEY set)
 *   2. z-ai-web-dev-sdk (universal fallback)
 *
 * Features:
 *   - Multiple voice profiles (alloy, echo, fable, onyx, nova, shimmer)
 *   - Speed & format control
 *   - Streaming audio synthesis
 *   - SSML processing support
 */

import ZAI from 'z-ai-web-dev-sdk';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('voice-tts');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TTSOptions {
  voice?: string;    // alloy, echo, fable, onyx, nova, shimmer
  model?: 'tts-1' | 'tts-1-hd';
  speed?: number;    // 0.25 to 4.0
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';
  language?: string;
}

export interface TTSResult {
  audioBuffer: Buffer;
  duration: number;
  format: string;
  size: number;
}

const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
const VALID_FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav'] as const;

// ---------------------------------------------------------------------------
// SSML Processing
// ---------------------------------------------------------------------------

function processSSML(text: string): string {
  // Strip SSML tags for providers that don't support them natively
  return text
    .replace(/<break\s+time="[^"]*"\s*\/>/g, '... ')
    .replace(/<emphasis\s+level="[^"]*">(.*?)<\/emphasis>/g, '$1')
    .replace(/<prosody\s+[^>]*>(.*?)<\/prosody>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function estimateDuration(text: string, speed: number): number {
  // Average speaking rate: ~150 words/min at speed 1.0
  const words = text.split(/\s+/).length;
  const wordsPerSecond = (150 * speed) / 60;
  return Math.max(0.5, words / wordsPerSecond);
}

// ---------------------------------------------------------------------------
// Provider: OpenAI TTS
// ---------------------------------------------------------------------------

async function synthesizeOpenAI(
  text: string,
  options: TTSOptions,
): Promise<TTSResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const voice = (VALID_VOICES.includes(options.voice as typeof VALID_VOICES[number])
    ? options.voice
    : 'alloy') as string;

  const model = options.model ?? 'tts-1';
  const speed = Math.max(0.25, Math.min(4.0, options.speed ?? 1.0));
  const format = (VALID_FORMATS.includes(options.responseFormat as typeof VALID_FORMATS[number])
    ? options.responseFormat
    : 'mp3') as string;

  const cleanText = processSSML(text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: cleanText,
        voice,
        speed,
        response_format: format,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`OpenAI TTS error: status ${res.status} — ${errBody}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    return {
      audioBuffer,
      duration: estimateDuration(cleanText, speed),
      format,
      size: audioBuffer.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Provider: z-ai-web-dev-sdk (fallback)
// ---------------------------------------------------------------------------

async function synthesizeZAI(
  text: string,
  options: TTSOptions,
): Promise<TTSResult> {
  try {
    const zai = await ZAI.create();
    const cleanText = processSSML(text);
    const speed = Math.max(0.25, Math.min(4.0, options.speed ?? 1.0));

    // Use the TTS capability of z-ai-web-dev-sdk
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tts = (zai as any).audio?.tts;
    if (!tts) {
      throw new Error('z-ai-sdk TTS not available');
    }

    const result = await tts.synthesize({
      text: cleanText,
      voice: options.voice ?? 'alloy',
      speed,
      format: options.responseFormat ?? 'mp3',
    });

    // z-ai-sdk may return base64 or Buffer
    const audioBuffer = Buffer.isBuffer(result.audio)
      ? result.audio
      : Buffer.from(result.audio, 'base64');

    return {
      audioBuffer,
      duration: result.duration ?? estimateDuration(cleanText, speed),
      format: options.responseFormat ?? 'mp3',
      size: audioBuffer.length,
    };
  } catch (error) {
    log.error('z-ai-sdk TTS fallback failed', { error: String(error) });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Provider: Groq TTS (if available — currently text-to-speech is limited)
// Groq doesn't offer TTS, but we include the slot for future expansion
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TextToSpeechEngine class
// ---------------------------------------------------------------------------

export class TextToSpeechEngine {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Synthesize speech from text.
   * Fallback chain: OpenAI → z-ai-sdk
   */
  async synthesize(text: string, options: TTSOptions = {}): Promise<TTSResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty for TTS synthesis');
    }

    // Limit text length to prevent abuse
    const MAX_TEXT_LENGTH = 4096;
    const truncatedText = text.length > MAX_TEXT_LENGTH
      ? text.slice(0, MAX_TEXT_LENGTH) + '...'
      : text;

    const providers = [
      { name: 'openai', fn: () => synthesizeOpenAI(truncatedText, options) },
      { name: 'z-ai-sdk', fn: () => synthesizeZAI(truncatedText, options) },
    ];

    let lastError: unknown;

    for (const provider of providers) {
      try {
        const result = await provider.fn();
        log.info('TTS synthesis completed', {
          provider: provider.name,
          format: result.format,
          size: result.size,
          duration: result.duration,
        });

        // Persist session to database
        await this.recordSession(truncatedText, result, options, provider.name);

        return result;
      } catch (error) {
        lastError = error;
        log.warn(`TTS provider ${provider.name} failed, trying next`, {
          error: String(error),
        });
      }
    }

    throw lastError ?? new Error('All TTS providers failed');
  }

  /**
   * Streaming synthesis — yields audio chunks as they're generated.
   * Since most TTS APIs return full audio, we chunk the result buffer.
   */
  async *synthesizeStream(
    text: string,
    options: TTSOptions = {},
  ): AsyncGenerator<Buffer> {
    const result = await this.synthesize(text, options);
    const CHUNK_SIZE = 8192; // 8KB chunks

    for (let offset = 0; offset < result.audioBuffer.length; offset += CHUNK_SIZE) {
      yield result.audioBuffer.subarray(offset, offset + CHUNK_SIZE);
    }
  }

  // -----------------------------------------------------------------------
  // Private: Record TTS session to DB
  // -----------------------------------------------------------------------

  private async recordSession(
    text: string,
    result: TTSResult,
    options: TTSOptions,
    provider: string,
  ): Promise<void> {
    try {
      await db.voiceSession.create({
        data: {
          userId: this.userId,
          type: 'tts',
          status: 'ended',
          language: options.language ?? 'en-US',
          ttsProvider: provider,
          transcription: text.slice(0, 2000),
          durationSeconds: Math.round(result.duration),
          metadata: JSON.stringify({
            voice: options.voice ?? 'alloy',
            model: options.model ?? 'tts-1',
            speed: options.speed ?? 1.0,
            format: result.format,
            size: result.size,
          }),
          endedAt: new Date(),
        },
      });
    } catch (error) {
      log.warn('Failed to record TTS session', { error: String(error) });
    }
  }
}
