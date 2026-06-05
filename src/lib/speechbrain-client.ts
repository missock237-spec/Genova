/**
 * SpeechBrain STT Client — Connect to SpeechBrain micro-service for speech recognition
 * 
 * SpeechBrain is an open-source PyTorch-based speech toolkit that provides
 * state-of-the-art ASR (Automatic Speech Recognition). This client communicates
 * with a SpeechBrain micro-service that exposes a REST API.
 * 
 * Fallback chain in STT: SpeechBrain (P0) → Groq Whisper → OpenAI Whisper → z-ai-sdk
 * 
 * Environment variables:
 *   SPEECHBRAIN_API_URL — Base URL of the SpeechBrain service (default: http://localhost:8187)
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('speechbrain-client');

// Types
export interface SpeechBrainTranscribeOptions {
  language?: string;
  model?: string; // e.g., 'asr-wav2vec2-commonvoice-fr', 'asr-whisper-large'
  enableDiarization?: boolean;
  detectLanguage?: boolean;
}

export interface SpeechBrainTranscribeResult {
  text: string;
  language: string;
  confidence: number;
  duration: number;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
    speaker?: string;
  }>;
}

export interface SpeechBrainModelInfo {
  id: string;
  name: string;
  language: string;
  type: 'asr' | 'tts' | 'diarization' | 'enhancement';
}

const SPEECHBRAIN_API_URL = process.env.SPEECHBRAIN_API_URL || 'http://localhost:8187';

/**
 * Check if SpeechBrain service is available
 */
export async function checkSpeechBrainHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${SPEECHBRAIN_API_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get available SpeechBrain models
 */
export async function getAvailableModels(): Promise<SpeechBrainModelInfo[]> {
  try {
    const response = await fetch(`${SPEECHBRAIN_API_URL}/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

/**
 * Transcribe audio using SpeechBrain
 */
export async function transcribeWithSpeechBrain(
  audioBuffer: Buffer,
  options: SpeechBrainTranscribeOptions = {},
): Promise<SpeechBrainTranscribeResult> {
  const startTime = Date.now();

  log.info('Transcribing with SpeechBrain', {
    audioSize: audioBuffer.length,
    language: options.language || 'auto',
  });

  // Send audio as multipart/form-data
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' });
  formData.append('audio', blob, 'audio.webm');

  if (options.language) {
    formData.append('language', options.language);
  }
  if (options.model) {
    formData.append('model', options.model);
  }
  if (options.enableDiarization) {
    formData.append('diarization', 'true');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${SPEECHBRAIN_API_URL}/transcribe`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(`SpeechBrain transcription error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();

    const duration = (Date.now() - startTime) / 1000;

    return {
      text: data.text ?? '',
      language: data.language ?? options.language ?? 'en',
      confidence: data.confidence ?? 0.85,
      duration: data.duration ?? duration,
      segments: data.segments?.map((seg: { text: string; start: number; end: number; confidence: number; speaker?: string }) => ({
        text: seg.text ?? '',
        start: seg.start ?? 0,
        end: seg.end ?? 0,
        confidence: seg.confidence ?? 0.8,
        speaker: seg.speaker,
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Enhance audio (noise reduction, etc.)
 */
export async function enhanceAudio(
  audioBuffer: Buffer,
): Promise<Buffer> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' });
  formData.append('audio', blob, 'audio.webm');

  const response = await fetch(`${SPEECHBRAIN_API_URL}/enhance`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`SpeechBrain enhancement error: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export { SPEECHBRAIN_API_URL };
