// ============================================================
// agent-safety.ts — TypeScript bindings pour le moteur Rust
// Appelle le module NAPI compilé depuis Rust
//
// ⚠️ FAIL-CLOSED: Le fallback JS est DÉSACTIVÉ en production.
//    Si le module Rust n'est pas compilé, les fonctions
//    lèveront une AgentSafetyError au lieu de retourner safe:true.
//    Pour le développement uniquement: NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY=1
// ============================================================

// Interface du module Rust NAPI
interface RustSafetyModule {
  safety_init(): boolean;
  validate_agent_prompt(prompt: string, max_tokens: number): JsPromptVerdict;
  validate_agent_tools(tools: string[], allowedList: string[]): JsToolValidation;
  start_agent_execution_session(agentId: string, maxExecutionMs: number): string;
  get_execution_session_status(sessionId: string): JsExecutionStatus;
  check_agent_resources(
    memoryBytes: number,
    cpuPercent: number,
    tokensUsed: number,
    toolCalls: number
  ): JsResourceCheck;
}

interface JsPromptVerdict {
  safe: boolean;
  reason: string;
  risk_score: number;
  flagged_categories: string[];
  token_count: number;
  sanitized_prompt: string;
}

interface JsToolValidation {
  safe: boolean;
  allowed_tools: string[];
  blocked_tools: string[];
  reason: string;
}

interface JsResourceCheck {
  can_proceed: boolean;
  memory_exceeded: boolean;
  cpu_exceeded: boolean;
  tokens_exceeded: boolean;
  tool_calls_exceeded: boolean;
  memory_limit_bytes: number;
  cpu_limit_percent: number;
  token_limit: number;
  tool_call_limit: number;
}

interface JsExecutionStatus {
  is_active: boolean;
  elapsed_ms: number;
  remaining_ms: number;
  max_allowed_ms: number;
  tool_calls_executed: number;
  tokens_consumed: number;
  memory_peak_bytes: number;
}

// ============================================================
// Fallback JS (DÉSACTIVÉ en production — FAIL-CLOSED)
// Ne s'active QUE si NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY=1
// ============================================================

const JS_FALLBACK_ENABLED = process.env.NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY === '1';

class FallbackSafety {
  safety_init(): boolean {
    if (!JS_FALLBACK_ENABLED) throw new AgentSafetyError('JS fallback is disabled in production');
    return true;
  }

  validate_agent_prompt(prompt: string, maxTokens: number): JsPromptVerdict {
    if (!JS_FALLBACK_ENABLED) {
      throw new AgentSafetyError(
        'Rust NAPI module not available. Agent execution is BLOCKED. ' +
        'Compile the crate (cd crates/agent-safety && npm run build) ' +
        'or set NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY=1 for development only.'
      );
    }
    const tokenCount = Math.ceil(prompt.length / 4);
    const flagged: string[] = [];
    const lowerPrompt = prompt.toLowerCase();

    if (/ignore\s+(all\s+)?(previous|above|system|your)\s+(instructions|prompts|rules)/i.test(lowerPrompt)) {
      flagged.push('prompt_injection');
    }
    if (/\b(DAN|STAN|jailbreak|sudo\s+mode|developer\s+mode|unfiltered|uncensored)\b/i.test(lowerPrompt)) {
      flagged.push('jailbreak_attempt');
    }
    if (/(output|show|reveal|tell|print|display)\s+(your|the|system|initial|hidden|secret)\s+(prompt|instructions)/i.test(lowerPrompt)) {
      flagged.push('system_prompt_leak');
    }
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(prompt)) {
      flagged.push('sensitive_data_exposure');
    }

    const riskScore = Math.min(flagged.length * 0.3, 1.0);

    return {
      safe: riskScore < 0.5,
      reason: flagged.length > 0
        ? `Flagged: ${flagged.join(', ')}`
        : 'Prompt validated successfully',
      risk_score: riskScore,
      flagged_categories: flagged,
      token_count: Math.min(tokenCount, maxTokens),
      sanitized_prompt: prompt.slice(0, 100000),
    };
  }

  validate_agent_tools(tools: string[], allowedList: string[]): JsToolValidation {
    if (!JS_FALLBACK_ENABLED) {
      throw new AgentSafetyError(
        'Rust NAPI module not available. Tool validation is BLOCKED.'
      );
    }
    const blocked: string[] = [];
    const allowed: string[] = [];
    const blockedSystemTools = [
      'shell_exec', 'exec_command', 'run_shell', 'bash_exec',
      'sql_raw_query', 'filesystem_delete', 'process_spawn',
    ];

    for (const tool of tools) {
      const lower = tool.toLowerCase();

      if (blockedSystemTools.includes(lower)) {
        blocked.push(tool);
        continue;
      }

      if (allowedList.length > 0) {
        const isAllowed = allowedList.some((a) => {
          if (a.endsWith('*')) {
            return lower.startsWith(a.slice(0, -1));
          }
          return lower === a.toLowerCase();
        });

        if (isAllowed) {
          allowed.push(tool);
        } else {
          blocked.push(tool);
        }
      } else {
        allowed.push(tool);
      }
    }

    return {
      safe: blocked.length === 0,
      allowed_tools: allowed,
      blocked_tools: blocked,
      reason: blocked.length > 0
        ? `${blocked.length} tool(s) blocked: ${blocked.join(', ')}`
        : `All ${tools.length} tools validated`,
    };
  }

  check_agent_resources(
    memoryBytes: number,
    cpuPercent: number,
    tokensUsed: number,
    toolCalls: number
  ): JsResourceCheck {
    const limits = {
      maxMemoryBytes: 512 * 1024 * 1024,
      maxCpuPercent: 80,
      maxTokens: 128_000,
      maxToolCalls: 100,
    };

    return {
      can_proceed:
        memoryBytes <= limits.maxMemoryBytes &&
        cpuPercent <= limits.maxCpuPercent &&
        tokensUsed <= limits.maxTokens &&
        toolCalls <= limits.maxToolCalls,
      memory_exceeded: memoryBytes > limits.maxMemoryBytes,
      cpu_exceeded: cpuPercent > limits.maxCpuPercent,
      tokens_exceeded: tokensUsed > limits.maxTokens,
      tool_calls_exceeded: toolCalls > limits.maxToolCalls,
      memory_limit_bytes: limits.maxMemoryBytes,
      cpu_limit_percent: limits.maxCpuPercent,
      token_limit: limits.maxTokens,
      tool_call_limit: limits.maxToolCalls,
    };
  }

  start_agent_execution_session(_agentId: string, _maxExecutionMs: number): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  get_execution_session_status(_sessionId: string): JsExecutionStatus {
    return {
      is_active: true,
      elapsed_ms: 0,
      remaining_ms: 30000,
      max_allowed_ms: 30000,
      tool_calls_executed: 0,
      tokens_consumed: 0,
      memory_peak_bytes: 0,
    };
  }
}

// ============================================================
// Factory: tente de charger le module Rust, fallback JS sinon
// ============================================================

let safetyInstance: RustSafetyModule | FallbackSafety;
let rustLoaded = false;

function loadSafetyEngine(): RustSafetyModule | FallbackSafety {
  try {
    // Tentative de chargement du module NAPI Rust
     
    // eslint-disable-next-line @typescript-eslint/no-require-imports
const rustModule = require('../../crates/agent-safety') as RustSafetyModule;
    rustModule.safety_init();
    rustLoaded = true;
    console.log('[agent-safety] Rust engine loaded successfully');
    return rustModule;
  } catch {
    if (JS_FALLBACK_ENABLED) {
      console.warn('[agent-safety] Rust engine not available, using JS fallback (UNSAFE — dev only)');
      return new FallbackSafety();
    }
    // FAIL-CLOSED: pas de Rust, pas de fallback = erreur au chargement
    console.error('[agent-safety] Rust engine not available and JS fallback is DISABLED (production mode). Agent execution is BLOCKED.');
    throw new AgentSafetyError(
      'Rust NAPI safety module not compiled and JS fallback disabled. ' +
      'Run: cd crates/agent-safety && npm run build. ' +
      'For dev only: set NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY=1'
    );
  }
}

function getSafetyEngine(): RustSafetyModule | FallbackSafety {
  if (!safetyInstance) {
    safetyInstance = loadSafetyEngine();
  }
  return safetyInstance;
}

// ============================================================
// API publique
// ============================================================

export function validateAgentPrompt(prompt: string, maxTokens = 128_000) {
  const engine = getSafetyEngine();
  return engine.validate_agent_prompt(prompt, maxTokens);
}

export function validateAgentTools(tools: string[], allowedList: string[] = []) {
  const engine = getSafetyEngine();
  return engine.validate_agent_tools(tools, allowedList);
}

export function checkAgentResources(
  memoryBytes: number,
  cpuPercent: number,
  tokensUsed: number,
  toolCalls: number
) {
  const engine = getSafetyEngine();
  return engine.check_agent_resources(memoryBytes, cpuPercent, tokensUsed, toolCalls);
}

export function startAgentExecutionSession(agentId: string, maxExecutionMs = 30_000) {
  const engine = getSafetyEngine();
  return engine.start_agent_execution_session(agentId, maxExecutionMs);
}

export function getExecutionSessionStatus(sessionId: string) {
  const engine = getSafetyEngine();
  return engine.get_execution_session_status(sessionId);
}

export function isRustEngineLoaded(): boolean {
  return rustLoaded;
}

export class AgentSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentSafetyError';
  }
}
