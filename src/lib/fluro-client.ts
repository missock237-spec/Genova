/**
 * Fluro Client — Ollama-based Local AI Engine
 *
 * Fluro is Genova's primary AI provider, running Ollama locally
 * on the server. It provides fast, free, and private AI inference
 * using open-source models (qwen, llama, mistral, etc.).
 *
 * Fallback chain: Fluro(P1) → z-ai-sdk(P2)
 *
 * API compatibility: OpenAI-compatible /v1/chat/completions endpoint
 * and native Ollama /api/chat endpoint.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('fluro-client');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const FLURO_BASE_URL = process.env.FLURO_API_URL || 'http://127.0.0.1:11434';
const FLURO_DEFAULT_MODEL = process.env.FLURO_DEFAULT_MODEL || 'qwen2.5:0.5b';
const FLURO_POWERFUL_MODEL = process.env.FLURO_POWERFUL_MODEL || 'qwen2.5:0.5b';
const FLURO_TIMEOUT_MS = 120_000; // 2 minutes — local inference can be slow on CPU

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FluroMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface FluroChatResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
}

export interface FluroStreamChunk {
  delta: string;
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface FluroModelInfo {
  name: string;
  size: number;
  quantization: string;
  family: string;
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/**
 * Check if Fluro (Ollama) server is reachable and responding.
 * Returns true if the server is healthy.
 */
export async function isFluroHealthy(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);

    const res = await fetch(`${FLURO_BASE_URL}/api/version`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check Fluro health and return detailed status.
 */
export async function checkFluroHealth(): Promise<{
  healthy: boolean;
  version?: string;
  models?: FluroModelInfo[];
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);

    // Check version endpoint
    const versionRes = await fetch(`${FLURO_BASE_URL}/api/version`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!versionRes.ok) {
      return { healthy: false, error: `Fluro returned HTTP ${versionRes.status}` };
    }

    const versionData = await versionRes.json();
    const version = versionData.version as string;

    // List available models
    let models: FluroModelInfo[] = [];
    try {
      const modelsRes = await fetch(`${FLURO_BASE_URL}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        models = (modelsData.models ?? []).map((m: Record<string, unknown>) => ({
          name: m.name as string,
          size: (m.size as number) ?? 0,
          quantization: (m.quantization_level as string) ?? 'unknown',
          family: (m.details as Record<string, string>)?.family ?? 'unknown',
        }));
      }
    } catch {
      // Non-critical — models listing failure
    }

    return { healthy: true, version, models };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { healthy: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// List Models
// ---------------------------------------------------------------------------

/**
 * List all models available on the Fluro (Ollama) server.
 */
export async function listFluroModels(): Promise<FluroModelInfo[]> {
  try {
    const res = await fetch(`${FLURO_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    return (data.models ?? []).map((m: Record<string, unknown>) => ({
      name: m.name as string,
      size: (m.size as number) ?? 0,
      quantization: (m.quantization_level as string) ?? 'unknown',
      family: (m.details as Record<string, string>)?.family ?? 'unknown',
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Chat (non-streaming)
// ---------------------------------------------------------------------------

/**
 * Send a chat completion request to Fluro (Ollama /api/chat endpoint).
 * Returns the full response as a single object.
 */
export async function callFluroChat(
  messages: FluroMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  },
): Promise<FluroChatResponse> {
  const model = options?.model ?? FLURO_DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? FLURO_TIMEOUT_MS;
  const start = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${FLURO_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const err = new Error(`Fluro API error: status ${res.status} — ${errBody.slice(0, 200)}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.message?.content ?? '';
    const evalCount = (data.eval_count ?? 0) as number;
    const promptEvalCount = (data.prompt_eval_count ?? 0) as number;
    const durationMs = Date.now() - start;

    log.info('Fluro chat completed', {
      model,
      durationMs,
      promptTokens: promptEvalCount,
      completionTokens: evalCount,
    });

    return {
      content,
      model: data.model ?? model,
      provider: 'fluro',
      usage: {
        promptTokens: promptEvalCount,
        completionTokens: evalCount,
        totalTokens: promptEvalCount + evalCount,
      },
      durationMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Chat (streaming)
// ---------------------------------------------------------------------------

/**
 * Send a streaming chat completion request to Fluro (Ollama /api/chat endpoint).
 * Yields chunks as they arrive.
 */
export async function* streamFluroChat(
  messages: FluroMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  },
): AsyncGenerator<FluroStreamChunk> {
  const model = options?.model ?? FLURO_DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? FLURO_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${FLURO_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error(`Fluro streaming error: status ${res.status}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No readable stream from Fluro');

    const decoder = new TextDecoder();
    let buffer = '';
    let totalTokens = 0;

    try {
      while (true) {
        if (controller.signal.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed);
            const delta = parsed.message?.content ?? '';

            if (delta) {
              totalTokens++;
              yield { delta, done: false };
            }

            if (parsed.done) {
              const promptEvalCount = (parsed.prompt_eval_count ?? 0) as number;
              const evalCount = (parsed.eval_count ?? 0) as number;

              yield {
                delta: '',
                done: true,
                usage: {
                  promptTokens: promptEvalCount,
                  completionTokens: evalCount,
                  totalTokens: promptEvalCount + evalCount,
                },
              };
              return;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // If we exit the loop without a done signal, emit one
    yield { delta: '', done: true, usage: { promptTokens: 0, completionTokens: totalTokens, totalTokens } };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible endpoint (for broader compatibility)
// ---------------------------------------------------------------------------

/**
 * Send a chat request using the OpenAI-compatible /v1/chat/completions endpoint.
 * Some integrations expect this format.
 */
export async function callFluroOpenAICompatible(
  messages: FluroMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  },
): Promise<FluroChatResponse> {
  const model = options?.model ?? FLURO_DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? FLURO_TIMEOUT_MS;
  const start = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${FLURO_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const err = new Error(`Fluro OpenAI-compat error: status ${res.status}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    const usage = data.usage ?? {};
    const durationMs = Date.now() - start;

    return {
      content,
      model: data.model ?? model,
      provider: 'fluro',
      usage: {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      },
      durationMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Model Management
// ---------------------------------------------------------------------------

/**
 * Pull a model to the Fluro server.
 */
export async function pullFluroModel(
  modelName: string,
  onProgress?: (status: string, completed: number, total: number) => void,
): Promise<boolean> {
  try {
    const res = await fetch(`${FLURO_BASE_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
      signal: AbortSignal.timeout(600_000), // 10 minutes max for model pull
    });

    if (!res.ok) return false;

    const reader = res.body?.getReader();
    if (!reader) return false;

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (onProgress) {
              onProgress(
                parsed.status ?? '',
                parsed.completed ?? 0,
                parsed.total ?? 0,
              );
            }
          } catch {
            // Skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return true;
  } catch (error) {
    log.error('Failed to pull Fluro model', { model: modelName, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/**
 * Delete a model from the Fluro server.
 */
export async function deleteFluroModel(modelName: string): Promise<boolean> {
  try {
    const res = await fetch(`${FLURO_BASE_URL}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
