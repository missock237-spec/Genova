// ============================================================
// agent-security-middleware.ts — Middleware de sécurité UNIQUE
// pour tous les points d'entrée d'exécution d'agent.
//
// PRINCIPE FAIL-CLOSED:
//   - Si le module Rust NAPI n'est PAS disponible → BLOCAGE.
//   - Si la validation Zod échoue → BLOCAGE.
//   - Si l'allowlist n'est pas définie → BLOCAGE.
//   - Jamais de fallback safe:true silencieux.
// ============================================================

import { z } from 'zod';
import { createLogger } from '@/lib/logger';

const log = createLogger('agent-security-middleware');

// ----------------------------------------------------------------
// Zod Schemas — Validation stricte des sorties LLM avant outils
// ----------------------------------------------------------------

/** Schéma strict pour un appel d'outil sortant du LLM. */
export const LLMToolCallSchema = z.object({
  toolName: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z][a-z0-9_]*$/i, 'Nom d\'outil invalide : caractères alphanumériques et _ uniquement'),
  toolInput: z.record(z.string(), z.unknown()).optional().default({}),
  reasoning: z.string().max(4000).optional(),
});

export type LLMToolCall = z.infer<typeof LLMToolCallSchema>;

/** Schéma pour la réponse de think/act du cycle ReAct (format JSON structuré). */
export const LLMThinkActSchema = z.object({
  thought: z.string().max(8000),
  action: z.string().max(256),
  actionInput: z.string().max(10000).optional().default(''),
});

export type LLMThinkAct = z.infer<typeof LLMThinkActSchema>;

/** Schéma pour la réponse brute OpenAI tool_calls. */
export const OpenAIToolCallSchema = z.object({
  id: z.string().min(1).max(256),
  type: z.literal('function'),
  function: z.object({
    name: z.string().min(1).max(128),
    arguments: z.string(),
  }),
});

// ----------------------------------------------------------------
// Allowlist d'outils par défaut (positive, restrictive)
// ----------------------------------------------------------------

/** Outils universellement autorisés pour tous les agents. */
const DEFAULT_ALLOWED_TOOLS: string[] = [
  'web_search',
  'calculator',
  'code_execute',
  'file_read',
  'file_write',
  'data_query',
  'rag_search',
  'rag_query',
  'knowledge_search',
  'memory_recall',
  'memory_store',
];

/** Outils JAMAIS autorisés, quelle que soit la config. */
const HARD_BLOCKED_TOOLS: string[] = [
  'shell_exec', 'exec_command', 'run_shell', 'bash_exec',
  'process_spawn', 'child_process',
  'sql_raw_query', 'sql_inject',
  'filesystem_delete', 'filesystem_remove', 'rm_rf',
  'reverse_shell', 'ddos', 'data_exfiltrate',
  'network_scan', 'port_scan',
  'credential_access', 'key_dump',
  'privilege_escalate', 'sudo_exec',
  'eval', 'function_constructor',
];

// ----------------------------------------------------------------
// Résultat de la sécurité
// ----------------------------------------------------------------

export type SecurityVerdict = {
  allowed: boolean;
  reason: string;
  engine: 'rust' | 'fallback' | 'blocked';
  toolName?: string;
};

export type ToolValidationResult = {
  allowed: boolean;
  blockedTools: string[];
  allowedTools: string[];
  reason: string;
};

// ----------------------------------------------------------------
// État du moteur Rust
// ----------------------------------------------------------------

let rustSafetyModule: unknown = null;
let rustLoadAttempted = false;
let rustLoadFailed = false;

/** Tente de charger le module Rust NAPI une seule fois.
 * Utilise un require dynamique pour ne pas faire echouer le build
 * quand le crate n'est pas compile (cas Vercel/CI).
 */
function tryLoadRustModule(): unknown {
  if (rustLoadAttempted) return rustSafetyModule;
  rustLoadAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../crates/agent-safety');
    if (mod && typeof mod.safety_init === 'function') {
      mod.safety_init();
      rustSafetyModule = mod;
      log.info('rust_safety_loaded', {});
    } else {
      rustLoadFailed = true;
      log.warn('rust_safety_init_failed', { reason: 'safety_init not a function' });
    }
  } catch {
    // Module Rust non compile (normal sur Vercel/CI sans Docker)
    rustLoadFailed = true;
    log.info('rust_safety_not_available', {
      hint: 'Using JS fallback. Compile the Rust NAPI crate for enhanced security.',
    });
  }

  return rustSafetyModule;
}

/** Vérifie si le moteur Rust est disponible. */
export function isRustSafetyAvailable(): boolean {
  return tryLoadRustModule() !== null;
}

// ----------------------------------------------------------------
// PROMPT VALIDATION — Fail-closed
// ----------------------------------------------------------------

/**
 * Valide un prompt utilisateur.
 * FAIL-CLOSED : si le moteur Rust n'est pas dispo, le prompt est BLOQUÉ.
 */
export async function validatePrompt(prompt: string): Promise<SecurityVerdict> {
  // 1. Vérifications de base (toujours actives)
  if (!prompt || typeof prompt !== 'string') {
    return { allowed: false, reason: 'Prompt vide ou invalide', engine: 'blocked' };
  }

  if (prompt.length > 500_000) {
    return { allowed: false, reason: 'Prompt trop long (>500K chars)', engine: 'blocked' };
  }

  // 2. Essayer le moteur Rust
  const rust = tryLoadRustModule();
  if (rust && typeof (rust as Record<string, unknown>).validate_agent_prompt === 'function') {
    try {
      const verdict = (rust as { validate_agent_prompt: (p: string, max: number) => { safe: boolean; reason: string; risk_score: number } })
        .validate_agent_prompt(prompt, 128_000);

      if (!verdict.safe) {
        log.warn('prompt_blocked_by_rust', {
          reason: verdict.reason,
          riskScore: verdict.risk_score,
          promptLength: prompt.length,
        });
        return { allowed: false, reason: verdict.reason, engine: 'rust' };
      }

      return { allowed: true, reason: 'Validated by Rust engine', engine: 'rust' };
    } catch (err) {
      log.error('rust_prompt_validation_error', {
        error: err instanceof Error ? err.message : String(err),
      });
      // FAIL-CLOSED : erreur Rust = blocage
      return {
        allowed: false,
        reason: `Rust validation engine error: ${err instanceof Error ? err.message : 'unknown'}`,
        engine: 'blocked',
      };
    }
  }

  // 3. FAIL-CLOSED : pas de Rust = blocage
  //    En production, le crate DOIT être compilé.
  //    En développement, permettre le bypass via NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY=1
  const unsafeAllowJs = process.env.NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY === '1';
  if (unsafeAllowJs) {
    log.warn('js_fallback_used', {
      reason: 'NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY=1 — THIS IS UNSAFE FOR PRODUCTION',
    });
    // Fallback JS basique (moins fiable que Rust)
    const jsVerdict = jsPromptCheck(prompt);
    if (!jsVerdict.allowed) {
      return { allowed: false, reason: jsVerdict.reason, engine: 'fallback' };
    }
    return { allowed: true, reason: 'Validated by JS fallback (UNSAFE)', engine: 'fallback' };
  }

  log.error('no_safety_engine_available', {
    hint: 'Compile the Rust NAPI crate or set NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY=1 for dev only',
  });
  return {
    allowed: false,
    reason: 'Safety engine not available. Agent execution requires the compiled Rust NAPI module.',
    engine: 'blocked',
  };
}

/**
 * Validation JS basique (seulement utilisée en mode dev avec NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY=1).
 */
function jsPromptCheck(prompt: string): SecurityVerdict {
  const lower = prompt.toLowerCase();
  const patterns = [
    { re: /ignore\s+(all\s+)?(previous|above|system|your)\s+(instructions|prompts|rules)/i, cat: 'prompt_injection' },
    { re: /\b(DAN|STAN|jailbreak|sudo\s+mode|developer\s+mode|unfiltered|uncensored)\b/i, cat: 'jailbreak_attempt' },
    { re: /(output|show|reveal|tell|print|display)\s+(your|the|system|initial|hidden|secret)\s+(prompt|instructions)/i, cat: 'system_prompt_leak' },
    { re: /\b(eval|Function\()|child_process|require\s*\(['"]child_process['"]\)/i, cat: 'code_injection' },
    { re: /\b(reverse.shell|nc\s+-|bash\s+-i|\/dev\/tcp)/i, cat: 'reverse_shell_attempt' },
  ];

  for (const { re, cat } of patterns) {
    if (re.test(lower)) {
      return { allowed: false, reason: `JS fallback detected: ${cat}`, engine: 'fallback' };
    }
  }

  return { allowed: true, reason: 'JS fallback: no patterns matched', engine: 'fallback' };
}

// ----------------------------------------------------------------
// TOOL VALIDATION — Allowlist positive par agent
// ----------------------------------------------------------------

/**
 * Valide les noms d'outils demandés par le LLM contre une allowlist positive.
 * Si allowedTools est vide/vide, utilise DEFAULT_ALLOWED_TOOLS.
 * Les outils dans HARD_BLOCKED_TOOLS sont TOUJOURS bloqués.
 *
 * @param requestedTools - Noms d'outils demandés par le LLM
 * @param allowedTools  - Allowlist positive pour cet agent (vide = défaut)
 */
export function validateTools(
  requestedTools: string[],
  allowedTools: string[] = [],
): ToolValidationResult {
  const effectiveAllowlist = allowedTools.length > 0 ? allowedTools : DEFAULT_ALLOWED_TOOLS;
  const blocked: string[] = [];
  const allowed: string[] = [];

  for (const tool of requestedTools) {
    const lower = tool.toLowerCase().trim();

    // 1. Vérifier les outils durement bloqués
    if (HARD_BLOCKED_TOOLS.includes(lower)) {
      blocked.push(tool);
      log.warn('tool_hard_blocked', { tool });
      continue;
    }

    // 2. Vérifier contre l'allowlist positive (supporte les wildcards type `huggingface_*`)
    const isAllowed = effectiveAllowlist.some((a) => {
      const aLower = a.toLowerCase();
      if (aLower.endsWith('*')) {
        return lower.startsWith(aLower.slice(0, -1));
      }
      return lower === aLower;
    });

    if (isAllowed) {
      allowed.push(tool);
    } else {
      blocked.push(tool);
      log.warn('tool_not_in_allowlist', { tool, agentAllowlistSize: allowedTools.length });
    }
  }

  return {
    allowed: blocked.length === 0,
    blockedTools: blocked,
    allowedTools: allowed,
    reason: blocked.length > 0
      ? `${blocked.length} outil(s) non autorisé(s): ${blocked.join(', ')}`
      : `Tous les ${requestedTools.length} outils validés`,
  };
}

/**
 * Valide un seul nom d'outil (pour validation inline).
 * Retourne true si l'outil est autorisé.
 */
export function isToolAllowed(
  toolName: string,
  allowedTools: string[] = [],
): boolean {
  const lower = toolName.toLowerCase().trim();

  if (HARD_BLOCKED_TOOLS.includes(lower)) return false;

  const effectiveAllowlist = allowedTools.length > 0 ? allowedTools : DEFAULT_ALLOWED_TOOLS;
  return effectiveAllowlist.some((a) => {
    const aLower = a.toLowerCase();
    if (aLower.endsWith('*')) return lower.startsWith(aLower.slice(0, -1));
    return lower === aLower;
  });
}

// ----------------------------------------------------------------
// LLM OUTPUT VALIDATION — Zod strict avant appel d'outil
// ----------------------------------------------------------------

/**
 * Valide et parse la sortie structurée d'un LLM (think/act format).
 * Retourne null si la validation échoue (FAIL-CLOSED).
 */
export function validateThinkActOutput(raw: string): LLMThinkAct | null {
  try {
    // Essayer de parser en JSON d'abord
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Essayer d'extraire via regex THOUGHT/ACTION
      const thoughtMatch = raw.match(/THOUGHT:\s*(.+?)(?:ACTION:|$)/s);
      const actionMatch = raw.match(/ACTION:\s*(.+?)(?:ACTION_INPUT:|OBSERVATION:|$)/s);
      const inputMatch = raw.match(/ACTION_INPUT:\s*(.+?)(?:OBSERVATION:|$)/s);

      if (thoughtMatch || actionMatch) {
        parsed = {
          thought: thoughtMatch?.[1]?.trim() || '',
          action: actionMatch?.[1]?.trim() || '',
          actionInput: inputMatch?.[1]?.trim() || '',
        };
      }
    }

    if (!parsed || typeof parsed !== 'object') return null;

    const result = LLMThinkActSchema.safeParse(parsed);
    if (!result.success) {
      log.warn('think_act_validation_failed', {
        issues: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      });
      return null;
    }

    // Validation supplémentaire : le nom de l'action doit être un identifiant valide
    if (result.data.action && !/^[a-z][a-z0-9_.]*$/i.test(result.data.action)) {
      log.warn('think_act_invalid_action_name', { action: result.data.action });
      return null;
    }

    return result.data;
  } catch (err) {
    log.error('think_act_parse_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Valide un tool_call OpenAI formaté.
 * Retourne null si la validation échoue.
 */
export function validateOpenAIToolCall(raw: unknown): { id: string; name: string; arguments: string } | null {
  const result = OpenAIToolCallSchema.safeParse(raw);
  if (!result.success) {
    log.warn('openai_tool_call_validation_failed', {
      issues: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
    });
    return null;
  }
  return {
    id: result.data.id,
    name: result.data.function.name,
    arguments: result.data.function.arguments,
  };
}

/**
 * Valide les arguments JSON d'un outil avant exécution.
 * Retourne l'objet parsé ou null si invalide.
 */
export function validateToolArguments(argsJson: string, maxDepth = 5, maxKeys = 50): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(argsJson);

    // Vérifier la profondeur
    const depth = (obj: unknown, d: number): number => {
      if (d > maxDepth) return d;
      if (typeof obj !== 'object' || obj === null) return d;
      if (Array.isArray(obj)) return Math.max(...obj.map(v => depth(v, d + 1)));
      return Math.max(...Object.values(obj).map(v => depth(v, d + 1)));
    };

    if (depth(parsed, 0) > maxDepth) {
      log.warn('tool_args_too_deep', { depth });
      return null;
    }

    // Vérifier le nombre de clés
    const countKeys = (obj: unknown): number => {
      if (typeof obj !== 'object' || obj === null) return 0;
      if (Array.isArray(obj)) return obj.reduce((s, v) => s + countKeys(v), 0);
      return Object.keys(obj).length + Object.values(obj).reduce((s, v) => s + countKeys(v), 0);
    };

    if (countKeys(parsed) > maxKeys) {
      log.warn('tool_args_too_many_keys', { keys: countKeys(parsed) });
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    log.warn('tool_args_json_parse_failed', {});
    return null;
  }
}

// ----------------------------------------------------------------
// MIDDLEWARE UNIFIÉ — À appeler au début de chaque point d'entrée
// ----------------------------------------------------------------

export interface AgentSecurityContext {
  agentId: string;
  userId: string;
  allowedTools: string[];
  sessionId?: string;
  source: 'api_run' | 'api_stream' | 'api_chat' | 'api_auto' | 'api_execute' | 'api_swarm' | 'api_delegate' | 'api_hyperagent' | 'api_specialized' | 'api_orchestrate' | 'api_multi_agent' | 'worker_auto' | 'agent_engine' | 'agent_runtime';
}

export interface SecurityCheckResult {
  promptValid: boolean;
  promptReason: string;
  engine: 'rust' | 'fallback' | 'blocked';
}

/**
 * Middleware de sécurité unifié pour tous les points d'entrée d'exécution.
 *
 * FAIL-CLOSED:
 *   - Prompt invalide → exception
 *   - Pas de moteur Rust en prod → exception
 *   - Outil non autorisé → exception
 *
 * @param input - Le texte d'entrée (prompt utilisateur ou tâche)
 * @param ctx   - Contexte de sécurité (agentId, userId, allowlist, source)
 * @throws {AgentSecurityBlockError} si la sécurité bloque
 */
export async function enforceSecurity(
  input: string,
  ctx: AgentSecurityContext,
): Promise<SecurityCheckResult> {
  // 1. Valider le prompt
  const promptResult = await validatePrompt(input);
  if (!promptResult.allowed) {
    log.warn('security_blocked', {
      agentId: ctx.agentId,
      userId: ctx.userId,
      source: ctx.source,
      reason: promptResult.reason,
      engine: promptResult.engine,
    });
    throw new AgentSecurityBlockError(
      `Sécurité: ${promptResult.reason}`,
      promptResult.engine,
      ctx.source,
    );
  }

  // 2. Vérifier que le moteur Rust est actif en production
  if (promptResult.engine === 'blocked') {
    throw new AgentSecurityBlockError(
      'Safety engine not available. Agent execution blocked.',
      'blocked',
      ctx.source,
    );
  }

  return {
    promptValid: true,
    promptReason: promptResult.reason,
    engine: promptResult.engine,
  };
}

/**
 * Valide un appel d'outil sortant du LLM.
 * Combine validation Zod + allowlist positive.
 *
 * @throws {AgentSecurityBlockError} si l'outil n'est pas autorisé ou le format invalide
 */
export function enforceToolSecurity(
  toolName: string,
  toolArgs: string,
  agentAllowedTools: string[],
): { name: string; args: Record<string, unknown> } {
  // 1. Valider le format du nom
  const nameValidation = LLMToolCallSchema.shape.toolName.safeParse(toolName);
  if (!nameValidation.success) {
    throw new AgentSecurityBlockError(
      `Nom d'outil invalide: ${toolName}`,
      'blocked',
      'tool_validation',
    );
  }

  // 2. Vérifier l'allowlist
  if (!isToolAllowed(toolName, agentAllowedTools)) {
    throw new AgentSecurityBlockError(
      `Outil non autorisé: ${toolName}`,
      'blocked',
      'tool_validation',
    );
  }

  // 3. Parser et valider les arguments
  const parsedArgs = validateToolArguments(toolArgs);
  if (parsedArgs === null) {
    throw new AgentSecurityBlockError(
      `Arguments d'outil invalides pour: ${toolName}`,
      'blocked',
      'tool_validation',
    );
  }

  return { name: toolName, args: parsedArgs };
}

// ----------------------------------------------------------------
// Erreur de blocage sécurité
// ----------------------------------------------------------------

export class AgentSecurityBlockError extends Error {
  public readonly engine: string;
  public readonly source: string;
  public readonly isSecurityBlock = true;

  constructor(message: string, engine: string, source: string) {
    super(message);
    this.name = 'AgentSecurityBlockError';
    this.engine = engine;
    this.source = source;
  }
}

// ----------------------------------------------------------------
// Health check pour le module
// ----------------------------------------------------------------

export function getSecurityHealth() {
  return {
    rustAvailable: isRustSafetyAvailable(),
    rustLoadFailed,
    jsFallbackEnabled: process.env.NEXT_PUBLIC_UNSAFE_ALLOW_JS_SAFETY === '1',
    defaultAllowedTools: DEFAULT_ALLOWED_TOOLS,
    hardBlockedTools: HARD_BLOCKED_TOOLS,
  };
}
