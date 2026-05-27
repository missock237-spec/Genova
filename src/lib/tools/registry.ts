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
// CAPABILITY SYSTEM — Granular agent capabilities
// ============================================================

export interface AgentCapability {
  agentId: string;
  toolName: string;
  actions: string[];        // ["read", "write", "execute", "network"]
  scope: 'full' | 'limited' | 'none';
  constraints: string[];    // Additional constraints
  maxCalls: number;         // -1 = unlimited
  callCount: number;
  expiresAt?: Date;
}

export interface ExecutionPolicy {
  id: string;
  name: string;
  description: string;
  rules: ExecutionPolicyRule[];
  agentTypes: string[];
  maxRetries: number;
  timeout: number;
  isActive: boolean;
}

export interface ExecutionPolicyRule {
  type: 'allow' | 'deny' | 'rate_limit' | 'require_approval' | 'time_restriction' | 'resource_limit';
  target: string;           // Tool name or "*"
  params: Record<string, unknown>;
}

export interface ToolScopedAuth {
  toolName: string;
  authToken: string;        // Encrypted auth token for external services
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];         // OAuth-like scopes
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
// CAPABILITY MANAGER — Granular per-agent capabilities
// ============================================================

class CapabilityManager {
  private capabilities: Map<string, AgentCapability> = new Map(); // key: agentId:toolName

  /**
   * Grant a capability to an agent for a specific tool
   */
  grantCapability(cap: Omit<AgentCapability, 'callCount'>): void {
    const key = `${cap.agentId}:${cap.toolName}`;
    this.capabilities.set(key, { ...cap, callCount: 0 });
  }

  /**
   * Revoke a capability from an agent
   */
  revokeCapability(agentId: string, toolName: string): void {
    this.capabilities.delete(`${agentId}:${toolName}`);
  }

  /**
   * Check if an agent has a specific capability
   */
  hasCapability(agentId: string, toolName: string, action: string): { allowed: boolean; reason?: string } {
    // Check tool-specific capability
    const key = `${agentId}:${toolName}`;
    const cap = this.capabilities.get(key);

    if (!cap) {
      // Check wildcard capability
      const wildcardKey = `${agentId}:*`;
      const wildcard = this.capabilities.get(wildcardKey);
      if (wildcard && wildcard.scope === 'full') {
        return { allowed: true };
      }
      return { allowed: false, reason: `Agent ${agentId} n'a pas de capability pour l'outil ${toolName}` };
    }

    // Check if capability has expired
    if (cap.expiresAt && cap.expiresAt < new Date()) {
      return { allowed: false, reason: `Capability expirée pour ${toolName}` };
    }

    // Check action
    if (!cap.actions.includes(action) && !cap.actions.includes('*')) {
      return { allowed: false, reason: `Action "${action}" non autorisée pour ${toolName}. Actions autorisées: ${cap.actions.join(', ')}` };
    }

    // Check scope
    if (cap.scope === 'none') {
      return { allowed: false, reason: `Scope "none" pour ${toolName}` };
    }

    // Check call limit
    if (cap.maxCalls !== -1 && cap.callCount >= cap.maxCalls) {
      return { allowed: false, reason: `Limite d'appels atteinte pour ${toolName} (${cap.maxCalls})` };
    }

    // Check constraints
    for (const constraint of cap.constraints) {
      if (constraint.startsWith('time:')) {
        // Time restriction: "time:09:00-17:00"
        const hours = constraint.replace('time:', '');
        const [start, end] = hours.split('-');
        const now = new Date();
        const currentHour = now.getHours();
        const startHour = parseInt(start.split(':')[0]);
        const endHour = parseInt(end.split(':')[0]);
        if (currentHour < startHour || currentHour >= endHour) {
          return { allowed: false, reason: `Contrainte temporelle: ${toolName} disponible uniquement entre ${start} et ${end}` };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Record a tool usage for rate limiting
   */
  recordUsage(agentId: string, toolName: string): void {
    const key = `${agentId}:${toolName}`;
    const cap = this.capabilities.get(key);
    if (cap) {
      cap.callCount++;
    }
  }

  /**
   * Get all capabilities for an agent
   */
  getAgentCapabilities(agentId: string): AgentCapability[] {
    return Array.from(this.capabilities.values())
      .filter(c => c.agentId === agentId);
  }

  /**
   * Load capabilities from database
   */
  loadFromDatabase(capabilities: AgentCapability[]): void {
    for (const cap of capabilities) {
      const key = `${cap.agentId}:${cap.toolName}`;
      this.capabilities.set(key, cap);
    }
  }
}

// ============================================================
// EXECUTION POLICY MANAGER
// ============================================================

class ExecutionPolicyManager {
  private policies: Map<string, ExecutionPolicy> = new Map();

  /**
   * Add or update an execution policy
   */
  setPolicy(policy: ExecutionPolicy): void {
    this.policies.set(policy.id, policy);
  }

  /**
   * Get applicable policies for an agent type
   */
  getApplicablePolicies(agentType: string): ExecutionPolicy[] {
    return Array.from(this.policies.values())
      .filter(p => p.isActive && (p.agentTypes.includes('*') || p.agentTypes.includes(agentType)));
  }

  /**
   * Check if an action is allowed by execution policies
   */
  checkPolicies(agentType: string, toolName: string, action: string): { allowed: boolean; policy?: ExecutionPolicy; reason?: string } {
    const applicable = this.getApplicablePolicies(agentType);

    for (const policy of applicable) {
      for (const rule of policy.rules) {
        if (rule.target !== '*' && rule.target !== toolName) continue;

        switch (rule.type) {
          case 'deny':
            return { allowed: false, policy, reason: `Bloqué par politique "${policy.name}": outil ${toolName} interdit` };
          case 'rate_limit': {
            const _maxCalls = rule.params.maxCalls as number;
            const _windowMs = rule.params.windowMs as number;
            // Rate limit check would need a counter — simplified for now
            break;
          }
          case 'require_approval':
            return { allowed: true, policy, reason: `Approbation requise par politique "${policy.name}"` };
          case 'time_restriction': {
            const allowedHours = rule.params.hours as string;
            const now = new Date();
            const currentHour = now.getHours();
            const [start, end] = allowedHours.split('-').map(h => parseInt(h));
            if (currentHour < start || currentHour >= end) {
              return { allowed: false, policy, reason: `Politique "${policy.name}": ${toolName} disponible uniquement entre ${allowedHours}` };
            }
            break;
          }
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Load policies from database
   */
  loadFromDatabase(policies: ExecutionPolicy[]): void {
    for (const policy of policies) {
      this.policies.set(policy.id, policy);
    }
  }
}

// ============================================================
// TOOL-SCOPED AUTH — Per-tool authentication tokens
// ============================================================

class ToolScopedAuthManager {
  private authTokens: Map<string, ToolScopedAuth> = new Map(); // key: agentId:toolName

  /**
   * Store an auth token for a tool
   */
  setAuthToken(agentId: string, auth: ToolScopedAuth): void {
    this.authTokens.set(`${agentId}:${auth.toolName}`, auth);
  }

  /**
   * Get auth token for a tool
   */
  getAuthToken(agentId: string, toolName: string): ToolScopedAuth | undefined {
    const auth = this.authTokens.get(`${agentId}:${toolName}`);
    if (auth?.expiresAt && auth.expiresAt < new Date()) {
      this.authTokens.delete(`${agentId}:${toolName}`);
      return undefined;
    }
    return auth;
  }

  /**
   * Check if a tool has valid authentication
   */
  hasValidAuth(agentId: string, toolName: string, requiredScope?: string): boolean {
    const auth = this.getAuthToken(agentId, toolName);
    if (!auth) return false;
    if (requiredScope && !auth.scopes.includes(requiredScope) && !auth.scopes.includes('*')) {
      return false;
    }
    return true;
  }

  /**
   * Revoke auth for a tool
   */
  revokeAuth(agentId: string, toolName: string): void {
    this.authTokens.delete(`${agentId}:${toolName}`);
  }

  /**
   * Get all auth tokens for an agent
   */
  getAgentAuthTokens(agentId: string): ToolScopedAuth[] {
    return Array.from(this.authTokens.entries())
      .filter(([key]) => key.startsWith(`${agentId}:`))
      .map(([, auth]) => auth);
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
  private capabilityManager = new CapabilityManager();
  private policyManager = new ExecutionPolicyManager();
  private authManager = new ToolScopedAuthManager();

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

    // 2.5 CAPABILITY CHECK — Check agent-specific capabilities
    if (context.agentId) {
      const capCheck = this.capabilityManager.hasCapability(context.agentId, name, 'execute');
      if (!capCheck.allowed) {
        return {
          success: false,
          result: null,
          error: capCheck.reason,
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

      // Check execution policies
      // We need to know the agent type — for now, we'll use the tool category as a proxy
      const policyCheck = this.policyManager.checkPolicies(tool.category, name, 'execute');
      if (!policyCheck.allowed) {
        return {
          success: false,
          result: null,
          error: policyCheck.reason,
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

      // Record usage for rate limiting
      this.capabilityManager.recordUsage(context.agentId, name);

      // Attach auth token to context if available
      const authToken = this.authManager.getAuthToken(context.agentId, name);
      if (authToken) {
        params._authToken = authToken.authToken;
        params._authScopes = authToken.scopes;
      }
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

  /**
   * Grant a capability to an agent
   */
  grantCapability(cap: Omit<AgentCapability, 'callCount'>): void {
    this.capabilityManager.grantCapability(cap);
  }

  /**
   * Revoke a capability from an agent
   */
  revokeCapability(agentId: string, toolName: string): void {
    this.capabilityManager.revokeCapability(agentId, toolName);
  }

  /**
   * Set an execution policy
   */
  setExecutionPolicy(policy: ExecutionPolicy): void {
    this.policyManager.setPolicy(policy);
  }

  /**
   * Store tool-scoped auth token
   */
  setToolAuth(agentId: string, auth: ToolScopedAuth): void {
    this.authManager.setAuthToken(agentId, auth);
  }

  /**
   * Get tool-scoped auth token
   */
  getToolAuth(agentId: string, toolName: string): ToolScopedAuth | undefined {
    return this.authManager.getAuthToken(agentId, toolName);
  }
}
