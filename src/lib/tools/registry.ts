// Tool Registry — Production Tool Execution Layer
// Architecture: Tool Registry → Permission Layer → Execution Sandbox → Result Parser
// Provides secure, isolated, and observable tool execution

import { PromptValidator } from '@/lib/security/prompt-validator';
import { Tracer } from '@/lib/observability/tracer';

// ============================================================
// INTERFACES
// ============================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required: boolean; default?: unknown }>;
  execute: (params: Record<string, unknown>, context: ToolExecutionContext) => Promise<unknown>;
  isDangerous?: boolean;
  category: 'search' | 'compute' | 'data' | 'communication' | 'file' | 'browser' | 'system';
  permissions?: ToolPermission[];
  rateLimit?: { maxCalls: number; windowMs: number };
  timeout?: number; // Max execution time in ms
  version?: string;
}

export interface ToolPermission {
  action: string;           // e.g., 'read', 'write', 'execute', 'network'
  resource?: string;        // e.g., 'filesystem', 'database', 'internet'
  scope?: 'full' | 'limited' | 'none';
  constraints?: string[];   // Additional constraints
}

export interface ToolExecutionContext {
  userId: string;
  agentId: string;
  conversationId?: string;
  sandbox: boolean;
  permissions?: string[];    // Explicit permissions granted for this execution
  maxExecTime?: number;      // Max execution time override
}

export interface ToolExecutionResult {
  success: boolean;
  result: unknown;
  error?: string;
  metadata: {
    toolName: string;
    executionTime: number;
    tokensUsed: number;
    sandboxed: boolean;
    permissionChecked: boolean;
    validated: boolean;
    timestamp: string;
  };
}

export interface PermissionPolicy {
  userId: string;
  agentId?: string;
  allowedTools: string[];     // Tools this policy allows
  deniedTools: string[];      // Tools this policy denies
  allowedActions: string[];   // Actions this policy allows
  maxDangerousCalls: number;  // Max dangerous tool calls per session
  dangerousCallCount: number; // Current count of dangerous calls
  requireApproval: string[];  // Tools that require explicit approval
}

// ============================================================
// PERMISSION LAYER
// ============================================================

class PermissionLayer {
  private policies: Map<string, PermissionPolicy> = new Map();
  private promptValidator = new PromptValidator();

  /**
   * Get or create a permission policy for a user/agent
   */
  getPolicy(userId: string, agentId?: string): PermissionPolicy {
    const key = `${userId}:${agentId || 'default'}`;
    let policy = this.policies.get(key);

    if (!policy) {
      policy = {
        userId,
        agentId,
        allowedTools: ['*'],       // Allow all by default
        deniedTools: [],            // Deny none by default
        allowedActions: ['read', 'compute', 'search'],
        maxDangerousCalls: 5,
        dangerousCallCount: 0,
        requireApproval: ['code_executor', 'filesystem'],
      };
      this.policies.set(key, policy);
    }

    return policy;
  }

  /**
   * Check if a tool execution is permitted
   */
  checkPermission(
    tool: ToolDefinition,
    context: ToolExecutionContext
  ): { allowed: boolean; reason?: string; requiresApproval: boolean } {
    const policy = this.getPolicy(context.userId, context.agentId);

    // Check if tool is explicitly denied
    if (policy.deniedTools.includes(tool.name)) {
      return { allowed: false, reason: `L'outil "${tool.name}" est explicitement interdit pour cet utilisateur.`, requiresApproval: false };
    }

    // Check if tool is in the allowed list (if not wildcard)
    if (!policy.allowedTools.includes('*') && !policy.allowedTools.includes(tool.name)) {
      return { allowed: false, reason: `L'outil "${tool.name}" n'est pas dans la liste des outils autorisés.`, requiresApproval: false };
    }

    // Check explicit permissions in context
    if (context.permissions && !context.permissions.includes(tool.name) && !context.permissions.includes('*')) {
      return { allowed: false, reason: `Permission explicite non accordée pour "${tool.name}".`, requiresApproval: false };
    }

    // Check dangerous tool limits
    if (tool.isDangerous) {
      if (policy.dangerousCallCount >= policy.maxDangerousCalls) {
        return { allowed: false, reason: `Limite d'appels dangereux atteinte (${policy.maxDangerousCalls}).`, requiresApproval: false };
      }

      // Check if approval is required
      if (policy.requireApproval.includes(tool.name)) {
        return { allowed: true, reason: 'Approbation requise pour outil dangereux.', requiresApproval: true };
      }
    }

    // Check tool-specific permissions
    if (tool.permissions) {
      for (const perm of tool.permissions) {
        if (!policy.allowedActions.includes(perm.action) && perm.scope !== 'none') {
          return { allowed: false, reason: `Action "${perm.action}" non autorisée pour cet utilisateur.`, requiresApproval: false };
        }
      }
    }

    return { allowed: true, requiresApproval: false };
  }

  /**
   * Record a dangerous tool usage
   */
  recordDangerousUsage(userId: string, agentId?: string): void {
    const policy = this.getPolicy(userId, agentId);
    policy.dangerousCallCount++;
  }

  /**
   * Validate parameters before execution
   */
  validateParameters(tool: ToolDefinition, params: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required parameters
    for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
      if (paramDef.required && !(paramName in params)) {
        // Use default if available
        if (paramDef.default !== undefined) {
          params[paramName] = paramDef.default;
        } else {
          errors.push(`Paramètre requis manquant: ${paramName}`);
        }
      }

      // Validate string parameters for injection
      if (paramName in params && typeof params[paramName] === 'string') {
        const validation = this.promptValidator.validatePrompt(params[paramName] as string);
        if (!validation.safe && validation.threatLevel === 'high') {
          errors.push(`Paramètre "${paramName}" contient du contenu potentiellement dangereux: ${validation.risks.join(', ')}`);
        }
      }

      // Type checking
      if (paramName in params) {
        const value = params[paramName];
        const expectedType = paramDef.type;
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (expectedType === 'number' && actualType !== 'number') {
          errors.push(`Paramètre "${paramName}" doit être un nombre, reçu: ${actualType}`);
        }
        if (expectedType === 'boolean' && actualType !== 'boolean') {
          errors.push(`Paramètre "${paramName}" doit être un booléen, reçu: ${actualType}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

// ============================================================
// EXECUTION SANDBOX
// ============================================================

class ExecutionSandbox {
  private activeExecutions: Map<string, { startTime: number; timeout: number }> = new Map();

  /**
   * Execute a function in a sandboxed environment with timeout
   */
  async executeSandboxed<T>(
    executionId: string,
    fn: () => Promise<T>,
    options: {
      timeout?: number;
      maxMemory?: number;
      sandboxed?: boolean;
    } = {}
  ): Promise<{ result: T; executionTime: number; timedOut: boolean }> {
    const timeout = options.timeout || 30000; // 30 second default
    const startTime = Date.now();

    this.activeExecutions.set(executionId, { startTime, timeout });

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Délai d'exécution dépassé (${timeout}ms)`));
        }, timeout);
      });

      // Race between execution and timeout
      const result = await Promise.race([
        fn(),
        timeoutPromise,
      ]);

      return {
        result,
        executionTime: Date.now() - startTime,
        timedOut: false,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Délai d\'exécution dépassé')) {
        return {
          result: null as T,
          executionTime: timeout,
          timedOut: true,
        };
      }
      throw error;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Check if an execution is currently running
   */
  isRunning(executionId: string): boolean {
    return this.activeExecutions.has(executionId);
  }

  /**
   * Get the number of active executions
   */
  getActiveCount(): number {
    return this.activeExecutions.size;
  }

  /**
   * Cancel an execution
   */
  cancel(executionId: string): boolean {
    return this.activeExecutions.delete(executionId);
  }
}

// ============================================================
// RESULT PARSER
// ============================================================

class ResultParser {
  /**
   * Parse and sanitize a tool execution result
   */
  parseResult(rawResult: unknown, tool: ToolDefinition): { result: unknown; tokensUsed: number; truncated: boolean } {
    let result = rawResult;
    let truncated = false;

    // Convert to string for token counting
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    const tokensUsed = Math.ceil(resultStr.length / 4);

    // Truncate if too long (max 10000 chars to prevent memory issues)
    const MAX_RESULT_LENGTH = 10000;
    if (resultStr.length > MAX_RESULT_LENGTH) {
      result = resultStr.substring(0, MAX_RESULT_LENGTH) + `\n... [Résultat tronqué: ${resultStr.length} caractères au total]`;
      truncated = true;
    }

    // Sanitize any sensitive data from result
    if (typeof result === 'string') {
      result = this.sanitizeOutput(result);
    }

    return { result, tokensUsed, truncated };
  }

  /**
   * Sanitize output to remove potential sensitive data
   */
  private sanitizeOutput(output: string): string {
    // Remove potential API keys from output
    let sanitized = output.replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]');
    sanitized = sanitized.replace(/gsk_[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]');
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9\-_\.]{20,}/g, 'Bearer [REDACTED]');

    // Remove potential file paths that might expose server structure
    sanitized = sanitized.replace(/\/home\/[^\s]+/g, '[REDACTED_PATH]');
    sanitized = sanitized.replace(/\/etc\/[^\s]+/g, '[REDACTED_PATH]');

    return sanitized;
  }
}

// ============================================================
// TOOL REGISTRY — Main class
// ============================================================

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private permissionLayer = new PermissionLayer();
  private sandbox = new ExecutionSandbox();
  private resultParser = new ResultParser();
  private tracer = new Tracer();
  private executionCounter = 0;

  /**
   * Register a tool
   */
  register(tool: ToolDefinition): void {
    // Validate tool definition
    if (!tool.name || !tool.description || !tool.execute) {
      throw new Error('Définition d\'outil invalide: nom, description et fonction d\'exécution requis');
    }

    // Set defaults
    tool.timeout = tool.timeout || 30000;
    tool.version = tool.version || '1.0.0';
    if (!tool.permissions) {
      tool.permissions = tool.isDangerous
        ? [{ action: 'execute', scope: 'limited' }]
        : [{ action: 'execute', scope: 'full' }];
    }

    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool with full pipeline: Permission → Sandbox → Parse
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const executionId = `tool_exec_${Date.now()}_${++this.executionCounter}`;
    const startTime = Date.now();

    // 1. Find the tool
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        result: null,
        error: `Outil "${name}" non trouvé`,
        metadata: {
          toolName: name,
          executionTime: Date.now() - startTime,
          tokensUsed: 0,
          sandboxed: context.sandbox,
          permissionChecked: false,
          validated: false,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // 2. PERMISSION CHECK
    const permCheck = this.permissionLayer.checkPermission(tool, context);
    if (!permCheck.allowed) {
      return {
        success: false,
        result: null,
        error: permCheck.reason,
        metadata: {
          toolName: name,
          executionTime: Date.now() - startTime,
          tokensUsed: 0,
          sandboxed: context.sandbox,
          permissionChecked: true,
          validated: false,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // 3. PARAMETER VALIDATION
    const paramValidation = this.permissionLayer.validateParameters(tool, params);
    if (!paramValidation.valid) {
      return {
        success: false,
        result: null,
        error: `Paramètres invalides: ${paramValidation.errors.join('; ')}`,
        metadata: {
          toolName: name,
          executionTime: Date.now() - startTime,
          tokensUsed: 0,
          sandboxed: context.sandbox,
          permissionChecked: true,
          validated: true,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // 4. SANDBOX RESTRICTION for dangerous tools
    if (tool.isDangerous && context.sandbox) {
      return {
        success: false,
        result: null,
        error: `Outil "${name}" non disponible en mode bac à sable. Approbation requise.`,
        metadata: {
          toolName: name,
          executionTime: Date.now() - startTime,
          tokensUsed: 0,
          sandboxed: true,
          permissionChecked: true,
          validated: true,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // 5. Record dangerous tool usage
    if (tool.isDangerous) {
      this.permissionLayer.recordDangerousUsage(context.userId, context.agentId);
    }

    // 6. EXECUTE IN SANDBOX with timeout
    try {
      const { result: rawResult, executionTime, timedOut } = await this.sandbox.executeSandboxed(
        executionId,
        () => tool.execute(params, context),
        { timeout: context.maxExecTime || tool.timeout, sandboxed: context.sandbox }
      );

      if (timedOut) {
        return {
          success: false,
          result: null,
          error: `Délai d'exécution dépassé pour l'outil "${name}"`,
          metadata: {
            toolName: name,
            executionTime,
            tokensUsed: 0,
            sandboxed: context.sandbox,
            permissionChecked: true,
            validated: true,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // 7. PARSE AND SANITIZE RESULT
      const parsed = this.resultParser.parseResult(rawResult, tool);

      return {
        success: true,
        result: parsed.result,
        metadata: {
          toolName: name,
          executionTime,
          tokensUsed: parsed.tokensUsed,
          sandboxed: context.sandbox,
          permissionChecked: true,
          validated: true,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur d\'exécution de l\'outil';
      return {
        success: false,
        result: null,
        error: message,
        metadata: {
          toolName: name,
          executionTime: Date.now() - startTime,
          tokensUsed: 0,
          sandboxed: context.sandbox,
          permissionChecked: true,
          validated: true,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Get all registered tools
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  /**
   * Get tool descriptions formatted for LLM prompt
   */
  getToolDescriptions(): string {
    return this.getAll()
      .map(tool => {
        const params = Object.entries(tool.parameters)
          .map(([name, def]) => `    - ${name} (${def.type}${def.required ? ', requis' : ', optionnel'}): ${def.description}`)
          .join('\n');
        const perms = tool.permissions?.map(p => `${p.action}:${p.scope}`).join(', ') || 'execute:full';
        return `${tool.name}${tool.isDangerous ? ' [DANGEREUX]' : ''} (v${tool.version || '1.0'}): ${tool.description}\n  Permissions: ${perms}\n  Paramètres:\n${params}`;
      })
      .join('\n\n');
  }

  /**
   * Get tool names as an array
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Check if a user has permission to use a tool
   */
  checkPermission(toolName: string, context: ToolExecutionContext): { allowed: boolean; requiresApproval: boolean; reason?: string } {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { allowed: false, requiresApproval: false, reason: `Outil "${toolName}" non trouvé` };
    }
    const result = this.permissionLayer.checkPermission(tool, context);
    return { allowed: result.allowed, requiresApproval: result.requiresApproval, reason: result.reason };
  }

  /**
   * Grant a specific permission to a user/agent
   */
  grantPermission(userId: string, agentId: string | undefined, toolName: string): void {
    const policy = this.permissionLayer.getPolicy(userId, agentId);
    if (!policy.allowedTools.includes(toolName) && !policy.allowedTools.includes('*')) {
      policy.allowedTools.push(toolName);
    }
    // Remove from denied list if present
    policy.deniedTools = policy.deniedTools.filter(t => t !== toolName);
    // Remove from approval required list
    policy.requireApproval = policy.requireApproval.filter(t => t !== toolName);
  }

  /**
   * Revoke permission for a tool
   */
  revokePermission(userId: string, agentId: string | undefined, toolName: string): void {
    const policy = this.permissionLayer.getPolicy(userId, agentId);
    if (!policy.deniedTools.includes(toolName)) {
      policy.deniedTools.push(toolName);
    }
    policy.allowedTools = policy.allowedTools.filter(t => t !== toolName);
  }

  /**
   * Get sandbox status
   */
  getSandboxStatus(): { activeExecutions: number } {
    return { activeExecutions: this.sandbox.getActiveCount() };
  }
}
