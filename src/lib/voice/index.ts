/**
 * Voice AI System — Genova SaaS
 *
 * Central export point for the Voice AI layer.
 * Provides factory functions and unified access to:
 *   - STT (Speech-to-Text)
 *   - TTS (Text-to-Speech)
 *   - Voice Agent (conversational AI)
 *   - Voice Memory (persistent voice memories)
 *   - AI Calls (phone call automation)
 */

// Re-export all modules
export { SpeechToTextEngine, type STTResult, type STTOptions } from './stt';
export { TextToSpeechEngine, type TTSResult, type TTSOptions } from './tts';
export { VoiceAgent, type VoiceAgentConfig, type VoiceAgentSession } from './voice-agent';
export { VoiceMemorySystem, type VoiceMemoryEntry } from './voice-memory';
export { AICallSystem, type AICallConfig, type AICallSession } from './ai-calls';

import { SpeechToTextEngine } from './stt';
import { TextToSpeechEngine } from './tts';
import { VoiceAgent } from './voice-agent';
import { VoiceMemorySystem } from './voice-memory';
import { AICallSystem } from './ai-calls';

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Create a SpeechToTextEngine for a user
 */
export function createSTTEngine(userId: string): SpeechToTextEngine {
  return new SpeechToTextEngine(userId);
}

/**
 * Create a TextToSpeechEngine for a user
 */
export function createTTSEngine(userId: string): TextToSpeechEngine {
  return new TextToSpeechEngine(userId);
}

/**
 * Create a VoiceAgent for a user
 */
export function createVoiceAgent(userId: string): VoiceAgent {
  return new VoiceAgent(userId);
}

/**
 * Create a VoiceMemorySystem for a user
 */
export function createVoiceMemory(userId: string): VoiceMemorySystem {
  return new VoiceMemorySystem(userId);
}

/**
 * Create an AICallSystem instance
 */
export function createAICallSystem(): AICallSystem {
  return new AICallSystem();
}

// ---------------------------------------------------------------------------
// Initialization check
// ---------------------------------------------------------------------------

export interface VoiceSystemStatus {
  stt: { available: boolean; providers: string[] };
  tts: { available: boolean; providers: string[] };
  agent: { available: boolean };
  memory: { available: boolean };
  calls: { available: boolean; providers: string[] };
}

/**
 * Get the current status of the voice system
 */
export function getVoiceSystemStatus(): VoiceSystemStatus {
  const sttProviders: string[] = [];
  if (process.env.GROQ_API_KEY) sttProviders.push('groq');
  if (process.env.OPENAI_API_KEY) sttProviders.push('openai');
  sttProviders.push('z-ai-sdk'); // Always available as fallback

  const ttsProviders: string[] = [];
  if (process.env.OPENAI_API_KEY) ttsProviders.push('openai');
  ttsProviders.push('z-ai-sdk'); // Always available as fallback

  const callProviders: string[] = [];
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    callProviders.push('twilio');
  }
  if (process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN) {
    callProviders.push('whatsapp');
  }

  return {
    stt: {
      available: true,
      providers: sttProviders,
    },
    tts: {
      available: true,
      providers: ttsProviders,
    },
    agent: { available: true },
    memory: { available: true },
    calls: {
      available: callProviders.length > 0,
      providers: callProviders,
    },
  };
}
