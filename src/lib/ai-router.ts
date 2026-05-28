/**
 * AI Router — PRIORITÉ 4
 *
 * Multi-provider AI router with fallback, retry (exponential backoff),
 * streaming via async generators, cost estimation, and usage tracking.
 *
 * Providers:
 *  - Groq       (direct REST when GROQ_API_KEY is set, else z-ai-web-dev-sdk)
 *  - OpenRouter  (direct REST when OPENROUTER_API_KEY is set, else z-ai-web-dev-sdk)
 *
 * Fallback chain is ordered by `priority` (lower = tried first).
 */

import ZAI from 'z-ai-web-dev-sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIStreamChunk {
  delta: string;
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider: string;
  model: string;
  costUsd: number;
}

export interface ProviderConfig {
  name: string;
  priority: number; // lower = higher priority
  models: {
    default: string;
    fast: string;
    powerful: string;
  };
}

export interface AIRouterConfig {
  providers: ProviderConfig[];
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: AIRouterConfig = {
  providers: [
    {
      name: 'groq',
      priority: 1,
      models: {
        default: 'llama-3.3-70b-versatile',
        fast: 'llama-3.1-8b-instant',
        powerful: 'llama-3.3-70b-versatile',
      },
    },
    {
      name: 'openrouter',
      priority: 2,
      models: {
        default: 'meta-llama/llama-3.1-8b-instruct:free',
        fast: 'meta-llama/llama-3.1-8b-instruct:free',
        powerful: 'meta-llama/llama-3.1-70b-instruct',
      },
    },
  ],
  maxRetries: 3,
  retryDelayMs: 500,
  timeoutMs: 60_000,
};

// ---------------------------------------------------------------------------
// Cost estimation (USD per 1 K tokens — approximate)
// ---------------------------------------------------------------------------

const GROQ_COST_PER_K: Record<string, { prompt: number; completion: number }> = {
  default:   { prompt: 0, completion: 0 },
  fast:      { prompt: 0, completion: 0 },
  powerful:  { prompt: 0, completion: 0 },
};

const OPENROUTER_COST_PER_K: Record<string, { prompt: number; completion: number }> = {
  'meta-llama/llama-3.1-8b-instruct:free': { prompt: 0, completion: 0 },
  'meta-llama/llama-3.1-70b-instruct':      { prompt: 0.00065, completion: 0.00075 },
};

function getCostPerK(
  provider: string,
  model: string,
): { prompt: number; completion: number } {
  if (provider === 'groq') {
    return GROQ_COST_PER_K[model] ?? { prompt: 0, completion: 0 };
  }
  if (provider === 'openrouter') {
    return OPENROUTER_COST_PER_K[model] ?? { prompt: 0.0005, completion: 0.0006 };
  }
  return { prompt: 0, completion: 0 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTransientError(error: unknown): boolean {
  if (error instanceof Response) {
    const s = error.status;
    return s === 429 || (s >= 500 && s <= 599);
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Network-level / timeout / rate-limit
    if (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('overloaded')
    ) {
      return true;
    }
    // If the error was caused by a fetch that returned a status, peek at the message
    const statusMatch = msg.match(/status[:\s]*(\d{3})/);
    if (statusMatch) {
      const s = parseInt(statusMatch[1], 10);
      return s === 429 || (s >= 500 && s <= 599);
    }
  }
  // Default to transient so we can retry — safer for unknown error shapes
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function generateRequestId(): string {
  return `ai_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Provider callers
// ---------------------------------------------------------------------------

interface ProviderCallResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  provider: string;
  model: string;
}

/**
 * Call via z-ai-web-dev-sdk (the universal fallback).
 */
async function callZAI(
  messages: AIMessage[],
  model: string,
  provider: string,
  timeoutMs: number,
): Promise<ProviderCallResult> {
  const zai = await ZAI.create();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const completion = await zai.chat.completions.create({
      messages,
      model,
      stream: false,
    });

    const content = completion.choices?.[0]?.message?.content ?? '';
    const usage = completion.usage ?? {};

    return {
      content,
      usage: {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      },
      provider,
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call Groq REST API directly when GROQ_API_KEY is available.
 */
async function callGroqDirect(
  messages: AIMessage[],
  model: string,
  timeoutMs: number,
): Promise<ProviderCallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error(`Groq API error: status ${res.status}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';

    return {
      content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      provider: 'groq',
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call OpenRouter REST API directly when OPENROUTER_API_KEY is available.
 */
async function callOpenRouterDirect(
  messages: AIMessage[],
  model: string,
  timeoutMs: number,
): Promise<ProviderCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error(`OpenRouter API error: status ${res.status}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';

    return {
      content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      provider: 'openrouter',
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Streaming callers
// ---------------------------------------------------------------------------

async function* streamZAI(
  messages: AIMessage[],
  model: string,
  provider: string,
  timeoutMs: number,
): AsyncGenerator<AIStreamChunk> {
  const zai = await ZAI.create();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let totalDelta = '';
  try {
    const completion = await zai.chat.completions.create({
      messages,
      model,
      stream: true,
    });

    for await (const chunk of completion) {
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        totalDelta += delta;
        yield { delta, done: false };
      }
    }

    yield {
      delta: '',
      done: true,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function* streamGroqDirect(
  messages: AIMessage[],
  model: string,
  timeoutMs: number,
): AsyncGenerator<AIStreamChunk> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error(`Groq streaming error: status ${res.status}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No readable stream from Groq');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          yield { delta: '', done: true, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
          return;
        }

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            yield { delta, done: false };
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    yield { delta: '', done: true, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  } finally {
    clearTimeout(timer);
  }
}

async function* streamOpenRouterDirect(
  messages: AIMessage[],
  model: string,
  timeoutMs: number,
): AsyncGenerator<AIStreamChunk> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error(`OpenRouter streaming error: status ${res.status}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No readable stream from OpenRouter');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          yield { delta: '', done: true, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
          return;
        }

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            yield { delta, done: false };
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    yield { delta: '', done: true, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// AIRouter class
// ---------------------------------------------------------------------------

export class AIRouter {
  private config: AIRouterConfig;
  private userId: string;

  constructor(userId: string, config?: Partial<AIRouterConfig>) {
    this.userId = userId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Public: chat()
  // -----------------------------------------------------------------------

  async chat(
    messages: AIMessage[],
    options?: { model?: 'default' | 'fast' | 'powerful'; provider?: string },
  ): Promise<AIResponse> {
    const modelTier = options?.model ?? 'default';
    const requestedProvider = options?.provider;

    // Build ordered provider list
    let providers = [...this.config.providers].sort(
      (a, b) => a.priority - b.priority,
    );

    if (requestedProvider) {
      const match = providers.find((p) => p.name === requestedProvider);
      if (match) {
        providers = [match, ...providers.filter((p) => p.name !== requestedProvider)];
      }
    }

    let lastError: unknown;

    for (const provider of providers) {
      const model = provider.models[modelTier];

      // Attempt with retries on this provider
      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        try {
          const result = await this.callProvider(messages, model, provider.name);

          // Track usage
          const costUsd = this.estimateCost(
            provider.name,
            model,
            result.usage.promptTokens,
            result.usage.completionTokens,
          );

          await this.trackUsage(
            provider.name,
            model,
            result.usage.promptTokens,
            result.usage.completionTokens,
            costUsd,
          );

          return {
            content: result.content,
            usage: result.usage,
            provider: result.provider,
            model: result.model,
            costUsd,
          };
        } catch (error) {
          lastError = error;

          // If not transient, don't retry this provider
          if (!isTransientError(error)) break;

          // If this was the last retry for this provider, move on
          if (attempt < this.config.maxRetries) {
            const delay = this.config.retryDelayMs * Math.pow(2, attempt);
            await sleep(delay);
          }
        }
      }
    }

    // All providers exhausted
    throw lastError ?? new Error('All AI providers failed');
  }

  // -----------------------------------------------------------------------
  // Public: chatStream()
  // -----------------------------------------------------------------------

  async *chatStream(
    messages: AIMessage[],
    options?: { model?: 'default' | 'fast' | 'powerful'; provider?: string },
  ): AsyncGenerator<AIStreamChunk> {
    const modelTier = options?.model ?? 'default';
    const requestedProvider = options?.provider;

    let providers = [...this.config.providers].sort(
      (a, b) => a.priority - b.priority,
    );

    if (requestedProvider) {
      const match = providers.find((p) => p.name === requestedProvider);
      if (match) {
        providers = [match, ...providers.filter((p) => p.name !== requestedProvider)];
      }
    }

    let lastError: unknown;

    for (const provider of providers) {
      const model = provider.models[modelTier];

      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        try {
          let totalDelta = '';

          const stream = this.streamProvider(messages, model, provider.name);

          for await (const chunk of stream) {
            totalDelta += chunk.delta;
            yield chunk;
          }

          // Track usage (best-effort — streaming doesn't always return token counts)
          const approxPromptTokens = Math.ceil(
            messages.reduce((s, m) => s + m.content.length, 0) / 4,
          );
          const approxCompletionTokens = Math.ceil(totalDelta.length / 4);

          const costUsd = this.estimateCost(
            provider.name,
            model,
            approxPromptTokens,
            approxCompletionTokens,
          );

          await this.trackUsage(
            provider.name,
            model,
            approxPromptTokens,
            approxCompletionTokens,
            costUsd,
          );

          return; // success
        } catch (error) {
          lastError = error;

          if (!isTransientError(error)) break;

          if (attempt < this.config.maxRetries) {
            const delay = this.config.retryDelayMs * Math.pow(2, attempt);
            await sleep(delay);
          }
        }
      }
    }

    throw lastError ?? new Error('All AI providers failed for streaming');
  }

  // -----------------------------------------------------------------------
  // Public: estimateCost()
  // -----------------------------------------------------------------------

  estimateCost(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): number {
    const rates = getCostPerK(provider, model);
    return (promptTokens / 1000) * rates.prompt + (completionTokens / 1000) * rates.completion;
  }

  // -----------------------------------------------------------------------
  // Private: dispatch to correct provider (non-streaming)
  // -----------------------------------------------------------------------

  private async callProvider(
    messages: AIMessage[],
    model: string,
    providerName: string,
  ): Promise<ProviderCallResult> {
    switch (providerName) {
      case 'groq':
        if (process.env.GROQ_API_KEY) {
          return callGroqDirect(messages, model, this.config.timeoutMs);
        }
        return callZAI(messages, model, providerName, this.config.timeoutMs);

      case 'openrouter':
        if (process.env.OPENROUTER_API_KEY) {
          return callOpenRouterDirect(messages, model, this.config.timeoutMs);
        }
        return callZAI(messages, model, providerName, this.config.timeoutMs);

      default:
        return callZAI(messages, model, providerName, this.config.timeoutMs);
    }
  }

  // -----------------------------------------------------------------------
  // Private: dispatch to correct provider (streaming)
  // -----------------------------------------------------------------------

  private streamProvider(
    messages: AIMessage[],
    model: string,
    providerName: string,
  ): AsyncGenerator<AIStreamChunk> {
    switch (providerName) {
      case 'groq':
        if (process.env.GROQ_API_KEY) {
          return streamGroqDirect(messages, model, this.config.timeoutMs);
        }
        return streamZAI(messages, model, providerName, this.config.timeoutMs);

      case 'openrouter':
        if (process.env.OPENROUTER_API_KEY) {
          return streamOpenRouterDirect(messages, model, this.config.timeoutMs);
        }
        return streamZAI(messages, model, providerName, this.config.timeoutMs);

      default:
        return streamZAI(messages, model, providerName, this.config.timeoutMs);
    }
  }

  // -----------------------------------------------------------------------
  // Private: usage tracking
  // -----------------------------------------------------------------------

  private async trackUsage(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    costUsd: number,
  ): Promise<void> {
    const requestId = generateRequestId();

    try {
      const { trackAICost } = await import('@/lib/analytics');
      await trackAICost({
        userId: this.userId,
        provider,
        model,
        promptTokens,
        completionTokens,
        costUsd,
        requestId,
      });
    } catch {
      // Analytics module not available yet — silent fail is intentional
    }

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[AI Router] provider=${provider} model=${model} tokens=${promptTokens}+${completionTokens} cost=$${costUsd.toFixed(6)} requestId=${requestId}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAIRouter(
  userId: string,
  config?: Partial<AIRouterConfig>,
): AIRouter {
  return new AIRouter(userId, config);
}

// ---------------------------------------------------------------------------
// Convenience: chatCompletion — Quick one-shot chat call
// ---------------------------------------------------------------------------

export async function chatCompletion(
  messages: AIMessage[],
  mode: 'default' | 'fast' | 'powerful' | 'quick_chat' | 'analysis' | 'reasoning' | 'orchestration' = 'default',
): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; provider: string; model: string; costUsd: number }> {
  const modelTier = (mode === 'fast' || mode === 'quick_chat') ? 'fast' as const
    : mode === 'powerful' || mode === 'analysis' || mode === 'reasoning' || mode === 'orchestration' ? 'powerful' as const
    : 'default' as const;

  const router = createAIRouter('system');
  return router.chat(messages, { model: modelTier });
}
