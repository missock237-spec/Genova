# Task: PRIORITÉ 4 — AI Router propre

## Summary

Created a comprehensive AI router with multi-provider support, fallback, retry with exponential backoff, streaming, cost estimation, and usage tracking. Updated all 4 API routes to use the new router.

## Files Created

### `/src/lib/ai-router.ts`
- **Types**: `AIMessage`, `AIStreamChunk`, `AIResponse`, `ProviderConfig`, `AIRouterConfig`
- **Provider Registry**: Groq (priority 1) and OpenRouter (priority 2) with default/fast/powerful model tiers
- **Class `AIRouter`** with factory function `createAIRouter(userId, config?)`:
  - `chat(messages, options?)` — Non-streaming with retry + fallback across providers
  - `chatStream(messages, options?)` — Streaming via `AsyncGenerator<AIStreamChunk>` with retry + fallback
  - `estimateCost(provider, model, promptTokens, completionTokens)` — USD cost estimation
- **Provider dispatching logic**:
  - Groq: uses direct REST API when `GROQ_API_KEY` is set, falls back to `z-ai-web-dev-sdk`
  - OpenRouter: uses direct REST API when `OPENROUTER_API_KEY` is set, falls back to `z-ai-web-dev-sdk`
  - Both non-streaming and streaming variants for each
- **Retry**: Exponential backoff (500ms → 1000ms → 2000ms), max 3 retries per provider
- **Transient error detection**: Retries on network/429/5xx, does NOT retry on 400/401/403
- **Usage tracking**: Dynamic import of `@/lib/analytics` `trackAICost()` with try/catch (graceful if module missing)
- **Default config**: Groq priority 1, OpenRouter priority 2, 3 max retries, 500ms base delay, 60s timeout

## Files Modified

### `/src/app/api/ai/chat/route.ts`
- Replaced direct `ZAI.create()` + `zai.chat.completions.create()` with `createAIRouter(auth.userId).chat(messages, { model: 'default' })`
- Response now includes `usage`, `provider`, `model`, `costUsd` alongside `reply`

### `/src/app/api/agents/[id]/chat/route.ts`
- Replaced direct `ZAI.create()` + streaming with `createAIRouter(auth.userId).chatStream(messages, { model: 'default' })`
- SSE stream now yields `AIStreamChunk` objects (`{ delta, done, usage? }`)
- Sends `data: [DONE]\n\n` on completion, `data: { error }` on failure

### `/src/app/api/ai/orchestrate/route.ts`
- Replaced direct `ZAI.create()` with `createAIRouter(auth.userId).chat(messages, { model: 'default' })`
- Same JSON parsing logic preserved for the orchestration plan

### `/src/app/api/ai/validate/route.ts`
- Replaced direct `ZAI.create()` with `createAIRouter(auth.userId).chat(messages, { model: 'default' })`
- Same JSON parsing + fail-safe logic preserved for guardrail validation

## Verification
- ESLint: ✅ No errors
- TypeScript: ✅ No errors in modified files (pre-existing errors in other analytics routes unrelated to this task)
