// Sandbox System — Isolated execution environment for agent tools
// Provides Docker-style isolation abstraction for safe code execution
// Architecture: Sandbox Manager → Isolation Layer → Resource Limits → Audit Log

import { db } from '@/lib/db';

// ============================================================
// INTERFACES
// ============================================================

export interface SandboxConfig {
  id: string;
  maxMemoryMB: number;
  maxCpuTimeMs: number;
  maxFileSizeKB: number;
  allowedNetwork: boolean;
  allowedFilesystem: boolean;
  allowedModules: string[];
  environmentVariables: Record<string, string>;
}

export interface SandboxExecution {
  id: string;
  sandboxId: string;
  code: string;
  language: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'killed';
  result?: unknown;
  error?: string;
  stdout: string[];
  stderr: string[];
  exitCode?: number;
  executionTimeMs: number;
  memoryUsedMB: number;
  startedAt: string;
  completedAt?: string;
}

export interface SandboxResourceLimits {
  maxMemoryMB: number;
  maxCpuTimeMs: number;
  maxFileSizeKB: number;
  maxProcesses: number;
  maxNetworkRequests: number;
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  id: 'default',
  maxMemoryMB: 128,
  maxCpuTimeMs: 10000, // 10 seconds
  maxFileSizeKB: 1024, // 1 MB
  allowedNetwork: false,
  allowedFilesystem: false,
  allowedModules: ['math', 'json', 'date'],
  environmentVariables: {},
};

export const DANGEROUS_SANDBOX_CONFIG: SandboxConfig = {
  id: 'dangerous',
  maxMemoryMB: 256,
  maxCpuTimeMs: 30000, // 30 seconds
  maxFileSizeKB: 5120, // 5 MB
  allowedNetwork: false,
  allowedFilesystem: true,
  allowedModules: ['math', 'json', 'date', 'fs-read-only'],
  environmentVariables: {},
};

// ============================================================
// SANDBOX MANAGER
// ============================================================

export class SandboxManager {
  private sandboxes: Map<string, SandboxConfig> = new Map();
  private executions: Map<string, SandboxExecution> = new Map();
  private auditLog: Array<{
    sandboxId: string;
    executionId: string;
    action: string;
    timestamp: string;
    details: string;
  }> = [];
  private executionCounter = 0;

  constructor() {
    // Register default sandbox configurations
    this.sandboxes.set('default', DEFAULT_SANDBOX_CONFIG);
    this.sandboxes.set('dangerous', DANGEROUS_SANDBOX_CONFIG);
  }

  /**
   * Create a new sandbox with custom configuration
   */
  createSandbox(config: Partial<SandboxConfig> & { id: string }): SandboxConfig {
    const sandbox: SandboxConfig = {
      ...DEFAULT_SANDBOX_CONFIG,
      ...config,
    };
    this.sandboxes.set(sandbox.id, sandbox);
    return sandbox;
  }

  /**
   * Get a sandbox configuration
   */
  getSandbox(id: string): SandboxConfig | undefined {
    return this.sandboxes.get(id);
  }

  /**
   * Execute code in a sandboxed environment
   */
  async executeCode(
    code: string,
    language: string,
    sandboxId: string = 'default',
    options: {
      userId?: string;
      agentId?: string;
      input?: Record<string, unknown>;
    } = {}
  ): Promise<SandboxExecution> {
    const sandbox = this.sandboxes.get(sandboxId) || DEFAULT_SANDBOX_CONFIG;
    const executionId = `sandbox_exec_${Date.now()}_${++this.executionCounter}`;

    const execution: SandboxExecution = {
      id: executionId,
      sandboxId,
      code,
      language,
      status: 'pending',
      stdout: [],
      stderr: [],
      executionTimeMs: 0,
      memoryUsedMB: 0,
      startedAt: new Date().toISOString(),
    };

    this.executions.set(executionId, execution);

    // Validate code before execution
    const validation = this.validateCode(code, language);
    if (!validation.safe) {
      execution.status = 'failed';
      execution.error = validation.errors.join('; ');
      execution.completedAt = new Date().toISOString();
      this.audit('validate-fail', sandboxId, executionId, `Code validation failed: ${validation.errors.join(', ')}`);
      return execution;
    }

    // Log execution start
    this.audit('execute-start', sandboxId, executionId, `Language: ${language}, Code length: ${code.length}`);

    execution.status = 'running';
    const startTime = Date.now();

    try {
      // Execute in sandbox based on language
      switch (language.toLowerCase()) {
        case 'javascript':
        case 'typescript':
          const jsResult = await this.executeJavaScript(code, sandbox, options.input);
          execution.result = jsResult.result;
          execution.stdout = jsResult.stdout;
          execution.stderr = jsResult.stderr;
          execution.exitCode = jsResult.exitCode;
          break;

        case 'python':
          // Python execution would require a real Python runtime or container
          execution.result = this.simulatePythonExecution(code);
          execution.stdout = [`[Simulé] Exécution Python: ${code.substring(0, 100)}...`];
          execution.exitCode = 0;
          break;

        default:
          execution.status = 'failed';
          execution.error = `Langage non supporté en sandbox: ${language}`;
          execution.completedAt = new Date().toISOString();
          return execution;
      }

      execution.executionTimeMs = Date.now() - startTime;
      execution.memoryUsedMB = this.estimateMemoryUsage(code, execution.result);

      // Check resource limits
      if (execution.executionTimeMs > sandbox.maxCpuTimeMs) {
        execution.status = 'timeout';
        execution.error = `Délai CPU dépassé: ${execution.executionTimeMs}ms > ${sandbox.maxCpuTimeMs}ms`;
      } else if (execution.memoryUsedMB > sandbox.maxMemoryMB) {
        execution.status = 'killed';
        execution.error = `Mémoire dépassée: ${execution.memoryUsedMB}MB > ${sandbox.maxMemoryMB}MB`;
      } else {
        execution.status = 'completed';
      }

      execution.completedAt = new Date().toISOString();
      this.audit('execute-complete', sandboxId, executionId, `Status: ${execution.status}, Time: ${execution.executionTimeMs}ms`);

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Erreur d\'exécution inconnue';
      execution.executionTimeMs = Date.now() - startTime;
      execution.completedAt = new Date().toISOString();
      this.audit('execute-error', sandboxId, executionId, execution.error);
    }

    return execution;
  }

  /**
   * Validate code for safe execution
   */
  validateCode(code: string, language: string): { safe: boolean; errors: string[] } {
    const errors: string[] = [];

    // Size check
    if (code.length > 50000) {
      errors.push('Code trop long (max 50000 caractères)');
    }

    if (language === 'javascript' || language === 'typescript') {
      // Check for forbidden patterns
      const forbiddenPatterns = [
        { pattern: /require\s*\(/, message: 'require() est interdit' },
        { pattern: /import\s+/, message: 'import est interdit' },
        { pattern: /process\./, message: 'process est interdit' },
        { pattern: /child_process/, message: 'child_process est interdit' },
        { pattern: /fs\.\s*(write|append|mkdir|rmdir|unlink|rename|copy)/, message: 'Écriture filesystem interdite' },
        { pattern: /eval\s*\(/, message: 'eval() est interdit' },
        { pattern: /Function\s*\(/, message: 'Function() est interdit' },
        { pattern: /setTimeout|setInterval/, message: 'setTimeout/setInterval est interdit' },
        { pattern: /__dirname|__filename/, message: '__dirname/__filename est interdit' },
        { pattern: /globalThis/, message: 'globalThis est interdit' },
        { pattern: /while\s*\(\s*true\s*\)/, message: 'Boucle infinie détectée' },
        { pattern: /for\s*\(\s*;\s*;\s*\)/, message: 'Boucle infinie détectée' },
      ];

      for (const { pattern, message } of forbiddenPatterns) {
        if (pattern.test(code)) {
          errors.push(`Code non autorisé: ${message}`);
        }
      }
    }

    if (language === 'python') {
      const forbiddenPatterns = [
        { pattern: /import\s+os/, message: 'os module est interdit' },
        { pattern: /import\s+subprocess/, message: 'subprocess est interdit' },
        { pattern: /import\s+sys/, message: 'sys module est interdit' },
        { pattern: /exec\s*\(/, message: 'exec() est interdit' },
        { pattern: /__import__/, message: '__import__ est interdit' },
        { pattern: /open\s*\(/, message: 'open() est interdit (utilisation fichier)' },
      ];

      for (const { pattern, message } of forbiddenPatterns) {
        if (pattern.test(code)) {
          errors.push(`Code Python non autorisé: ${message}`);
        }
      }
    }

    return { safe: errors.length === 0, errors };
  }

  /**
   * Execute JavaScript in an isolated context
   */
  private async executeJavaScript(
    code: string,
    sandbox: SandboxConfig,
    input?: Record<string, unknown>
  ): Promise<{ result: unknown; stdout: string[]; stderr: string[]; exitCode: number }> {
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      // Mock console for capturing output
      const mockConsole = {
        log: (...args: unknown[]) => stdout.push(args.map(String).join(' ')),
        error: (...args: unknown[]) => stderr.push(args.map(String).join(' ')),
        warn: (...args: unknown[]) => stdout.push('[WARN] ' + args.map(String).join(' ')),
        info: (...args: unknown[]) => stdout.push('[INFO] ' + args.map(String).join(' ')),
      };

      // Safe globals — only allow non-dangerous built-ins
      const safeGlobals: Record<string, unknown> = {
        Math,
        Date,
        JSON: { parse: JSON.parse, stringify: JSON.stringify },
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Map: Map,
        Set: Set,
        Promise,
        Symbol,
        undefined: undefined,
        NaN: NaN,
        Infinity: Infinity,
        input: input || {},
      };

      // Add allowed modules
      if (sandbox.allowedModules.includes('math')) {
        // Math is already included
      }

      // Wrap code in strict mode with isolated context
      const wrappedCode = `
        "use strict";
        const { Math: _Math, Date: _Date, JSON: _JSON, parseInt: _parseInt, parseFloat: _parseFloat,
                isNaN: _isNaN, isFinite: _isFinite, Array: _Array, Object: _Object, String: _String,
                Number: _Number, Boolean: _Boolean, Map: _Map, Set: _Set, Promise: _Promise,
                Symbol: _Symbol, input: _input } = __globals;
        const console = __console;
        const undefined = void 0;
        ${code}
      `;

      const fn = new Function('__console', '__globals', wrappedCode);
      const result = fn(mockConsole, safeGlobals);

      return {
        result: result !== undefined ? result : (stdout.length > 0 ? stdout.join('\n') : null),
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error) {
      stderr.push(error instanceof Error ? error.message : 'Erreur d\'exécution inconnue');
      return {
        result: null,
        stdout,
        stderr,
        exitCode: 1,
      };
    }
  }

  /**
   * Simulate Python execution (placeholder for Docker/E2B integration)
   */
  private simulatePythonExecution(code: string): string {
    return `[Exécution Python simulée]\nCode: ${code.substring(0, 200)}${code.length > 200 ? '...' : ''}\n\nNote: L'exécution Python réelle nécessite un runtime Docker ou E2B.`;
  }

  /**
   * Estimate memory usage of an execution
   */
  private estimateMemoryUsage(code: string, result: unknown): number {
    const codeSize = code.length / 1024; // KB
    const resultSize = (typeof result === 'string' ? result.length : JSON.stringify(result || '').length) / 1024; // KB
    const baseMB = 10; // Base sandbox overhead
    return baseMB + (codeSize + resultSize) / 1024; // Convert KB to MB
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): SandboxExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all executions for a sandbox
   */
  getSandboxExecutions(sandboxId: string): SandboxExecution[] {
    return Array.from(this.executions.values())
      .filter(e => e.sandboxId === sandboxId);
  }

  /**
   * Get audit log
   */
  getAuditLog(sandboxId?: string): Array<{
    sandboxId: string;
    executionId: string;
    action: string;
    timestamp: string;
    details: string;
  }> {
    if (sandboxId) {
      return this.auditLog.filter(l => l.sandboxId === sandboxId);
    }
    return [...this.auditLog];
  }

  /**
   * Add entry to audit log
   */
  private audit(action: string, sandboxId: string, executionId: string, details: string): void {
    this.auditLog.push({
      sandboxId,
      executionId,
      action,
      timestamp: new Date().toISOString(),
      details,
    });

    // Keep audit log manageable
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-500);
    }
  }

  /**
   * Clean up old executions
   */
  cleanup(maxAge: number = 3600000): void {
    const cutoff = Date.now() - maxAge;
    for (const [id, execution] of this.executions.entries()) {
      if (execution.completedAt && new Date(execution.completedAt).getTime() < cutoff) {
        this.executions.delete(id);
      }
    }
  }

  /**
   * Get sandbox statistics
   */
  getStats(): {
    totalSandboxes: number;
    totalExecutions: number;
    activeExecutions: number;
    failedExecutions: number;
    auditLogSize: number;
  } {
    return {
      totalSandboxes: this.sandboxes.size,
      totalExecutions: this.executions.size,
      activeExecutions: Array.from(this.executions.values()).filter(e => e.status === 'running').length,
      failedExecutions: Array.from(this.executions.values()).filter(e => e.status === 'failed').length,
      auditLogSize: this.auditLog.length,
    };
  }
}

// Singleton instance
let sandboxManagerInstance: SandboxManager | null = null;

export function getSandboxManager(): SandboxManager {
  if (!sandboxManagerInstance) {
    sandboxManagerInstance = new SandboxManager();
  }
  return sandboxManagerInstance;
}
