// Sandbox System — Isolated execution environment for agent tools
// Provides Docker-style isolation abstraction for safe code execution
// Architecture: Sandbox Manager → Isolation Layer → Resource Limits → Audit Log
// Supports: Docker > Subprocess > Simulated (auto-detected)

import { db } from '@/lib/db';
import { spawn, exec } from 'child_process';
import type { ChildProcess } from 'child_process';

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

/** Execution method detected for the sandbox */
export type ExecutionMethod = 'docker' | 'subprocess' | 'simulated';

// ============================================================
// DOCKER AVAILABILITY CHECK
// ============================================================

let dockerAvailableCache: boolean | null = null;
let dockerCheckPromise: Promise<boolean> | null = null;

/**
 * Check if Docker is available on the system
 */
async function isDockerAvailable(): Promise<boolean> {
  if (dockerAvailableCache !== null) return dockerAvailableCache;

  if (dockerCheckPromise) return dockerCheckPromise;

  dockerCheckPromise = new Promise((resolve) => {
    const proc = spawn('docker', ['--version'], {
      stdio: 'pipe',
      timeout: 5000,
    });

    let output = '';
    proc.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    proc.on('error', () => {
      dockerAvailableCache = false;
      resolve(false);
    });

    proc.on('close', (code) => {
      dockerAvailableCache = code === 0 && output.includes('Docker');
      resolve(dockerAvailableCache);
    });

    // Timeout fallback
    setTimeout(() => {
      proc.kill();
      dockerAvailableCache = false;
      resolve(false);
    }, 6000);
  });

  return dockerCheckPromise;
}

/**
 * Reset the Docker availability cache (for testing)
 */
export function resetDockerCache(): void {
  dockerAvailableCache = null;
  dockerCheckPromise = null;
}

// ============================================================
// SANDBOX MANAGER (Base class — original functionality preserved)
// ============================================================

export class SandboxManager {
  private sandboxes: Map<string, SandboxConfig> = new Map();
  protected executions: Map<string, SandboxExecution> = new Map();
  private auditLog: Array<{
    sandboxId: string;
    executionId: string;
    action: string;
    timestamp: string;
    details: string;
  }> = [];
  protected executionCounter = 0;

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
        case 'typescript': {
          const jsResult = await this.executeJavaScript(code, sandbox, options.input);
          execution.result = jsResult.result;
          execution.stdout = jsResult.stdout;
          execution.stderr = jsResult.stderr;
          execution.exitCode = jsResult.exitCode;
          break;
        }

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
  protected audit(action: string, sandboxId: string, executionId: string, details: string): void {
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

// ============================================================
// SUBPROCESS SANDBOX — Real process execution via child_process
// ============================================================

export class SubprocessSandbox extends SandboxManager {
  private activeProcesses: Map<string, ChildProcess> = new Map();

  /**
   * Execute code in a sandboxed environment using real subprocesses
   * For Python: spawns python3 process
   * For JavaScript: uses existing new Function() approach
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
    const sandbox = this.getSandbox(sandboxId) || DEFAULT_SANDBOX_CONFIG;
    const executionId = `subprocess_exec_${Date.now()}_${++this.executionCounter}`;

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

    this.audit('execute-start', sandboxId, executionId, `Language: ${language}, Method: subprocess, Code length: ${code.length}`);

    execution.status = 'running';
    const startTime = Date.now();

    try {
      switch (language.toLowerCase()) {
        case 'javascript':
        case 'typescript': {
          // Use existing Function()-based approach for JavaScript
          const jsResult = await this.executeJavaScriptSubprocess(code, sandbox, options.input);
          execution.result = jsResult.result;
          execution.stdout = jsResult.stdout;
          execution.stderr = jsResult.stderr;
          execution.exitCode = jsResult.exitCode;
          break;
        }

        case 'python': {
          // Real Python execution via subprocess
          const pyResult = await this.executePythonSubprocess(code, sandbox);
          execution.result = pyResult.result;
          execution.stdout = pyResult.stdout;
          execution.stderr = pyResult.stderr;
          execution.exitCode = pyResult.exitCode;
          break;
        }

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
   * Execute Python code via child_process.spawn
   * - No network access (not enforced at OS level, but validated at code level)
   * - Restricted filesystem (validated at code level)
   * - Resource limits: timeout, memory estimation
   * - Output capture (stdout/stderr)
   */
  private executePythonSubprocess(
    code: string,
    sandbox: SandboxConfig
  ): Promise<{ result: string; stdout: string[]; stderr: string[]; exitCode: number }> {
    return new Promise((resolve) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const timeoutMs = sandbox.maxCpuTimeMs;

      // Build safe Python code wrapper that captures output
      const wrappedCode = `import json
import sys

# Capture stdout for result
_captured_output = []

class _CaptureWriter:
    def __init__(self, original, capture_list):
        self._original = original
        self._capture = capture_list
    def write(self, text):
        self._capture.append(text)
        self._original.write(text)
    def flush(self):
        self._original.flush()

_original_stdout = sys.stdout
sys.stdout = _CaptureWriter(sys.stdout, _captured_output)

try:
${code.split('\n').map((line: string) => `    ${line}`).join('\n')}
finally:
    sys.stdout = _original_stdout
    # Output the captured result as JSON for the sandbox to parse
    _result_text = ''.join(_captured_output)
    print("\\n___SANDBOX_RESULT___")
    print(json.dumps({"output": _result_text, "stdout_lines": _captured_output}))
`;

      const proc = spawn('python3', ['-c', wrappedCode], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          // Minimal environment — no PATH leakage of sensitive info
          PATH: process.env.PATH || '/usr/bin:/bin',
          HOME: '/tmp',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
          // No network-related env vars
        },
        timeout: timeoutMs,
        // Resource limits via ulimit-style options
        ...(process.platform !== 'win32' && {
          detached: false,
        }),
      });

      // Track active process for cleanup
      const procId = `python_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      this.activeProcesses.set(procId, proc);

      proc.stdout.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        for (const line of text.split('\n')) {
          if (line.trim()) stdout.push(line);
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        for (const line of text.split('\n')) {
          if (line.trim()) stderr.push(line);
        }
      });

      // Set a hard timeout
      const timeoutHandle = setTimeout(() => {
        proc.kill('SIGKILL');
        stderr.push(`[Sandbox] Process killed: timeout after ${timeoutMs}ms`);
      }, timeoutMs + 2000); // 2s grace period beyond spawn timeout

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);
        this.activeProcesses.delete(procId);

        // Parse the sandbox result from the output
        let result = stdout.join('\n');
        const resultMarker = '___SANDBOX_RESULT___';
        const resultIndex = result.indexOf(resultMarker);
        if (resultIndex !== -1) {
          const resultJson = result.substring(resultIndex + resultMarker.length).trim();
          try {
            const parsed = JSON.parse(resultJson);
            result = parsed.output || '';
            // Replace stdout with pre-marker output only
            const preResult = result.substring(0, resultIndex).trim();
            stdout.length = 0;
            if (preResult) {
              for (const line of preResult.split('\n')) {
                if (line.trim()) stdout.push(line);
              }
            }
          } catch {
            // If parsing fails, use raw output
          }
        }

        resolve({
          result,
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutHandle);
        this.activeProcesses.delete(procId);
        stderr.push(`[Sandbox] Process error: ${err.message}`);
        resolve({
          result: '',
          stdout,
          stderr,
          exitCode: 1,
        });
      });

      // Close stdin — we don't send input via stdin
      proc.stdin?.end();
    });
  }

  /**
   * Execute JavaScript using the existing new Function() approach
   * Attempts to use VM2/VM sandbox if available, otherwise uses the base class approach
   */
  private async executeJavaScriptSubprocess(
    code: string,
    sandbox: SandboxConfig,
    input?: Record<string, unknown>
  ): Promise<{ result: unknown; stdout: string[]; stderr: string[]; exitCode: number }> {
    // Try to use VM2 if available for better isolation
    try {
      const vm2Module = await this.tryLoadVM2();
      if (vm2Module) {
        return this.executeJavaScriptVM2(code, sandbox, input, vm2Module);
      }
    } catch {
      // VM2 not available, fall through
    }

    // Fallback to existing Function()-based approach
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const mockConsole = {
        log: (...args: unknown[]) => stdout.push(args.map(String).join(' ')),
        error: (...args: unknown[]) => stderr.push(args.map(String).join(' ')),
        warn: (...args: unknown[]) => stdout.push('[WARN] ' + args.map(String).join(' ')),
        info: (...args: unknown[]) => stdout.push('[INFO] ' + args.map(String).join(' ')),
      };

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
   * Try to load VM2 module for enhanced JS sandboxing
   */
  private async tryLoadVM2(): Promise<unknown | null> {
    try {
      // Dynamic import — will fail if vm2 is not installed
      const vm2 = await import('vm2');
      return vm2;
    } catch {
      return null;
    }
  }

  /**
   * Execute JavaScript in VM2 sandbox if available
   */
  private executeJavaScriptVM2(
    code: string,
    sandbox: SandboxConfig,
    input: Record<string, unknown> | undefined,
    vm2Module: unknown
  ): { result: unknown; stdout: string[]; stderr: string[]; exitCode: number } {
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const VM = (vm2Module as Record<string, unknown>).VM as new (opts: Record<string, unknown>) => { run: (script: { new (code: string): unknown }) => unknown } | undefined;
      const VMScript = (vm2Module as Record<string, unknown>).VMScript as new (code: string) => unknown | undefined;

      if (!VM || !VMScript) {
        throw new Error('VM2 module structure not as expected');
      }

      const vm = new VM({
        timeout: sandbox.maxCpuTimeMs,
        sandbox: {
          console: {
            log: (...args: unknown[]) => stdout.push(args.map(String).join(' ')),
            error: (...args: unknown[]) => stderr.push(args.map(String).join(' ')),
            warn: (...args: unknown[]) => stdout.push('[WARN] ' + args.map(String).join(' ')),
            info: (...args: unknown[]) => stdout.push('[INFO] ' + args.map(String).join(' ')),
          },
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
          input: input || {},
        },
      });

      const script = new VMScript(`"use strict";\n${code}`);
      const result = vm.run(script);

      return {
        result: result !== undefined ? result : (stdout.length > 0 ? stdout.join('\n') : null),
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error) {
      stderr.push(error instanceof Error ? error.message : 'Erreur d\'exécution VM2');
      return {
        result: null,
        stdout,
        stderr,
        exitCode: 1,
      };
    }
  }

  /**
   * Kill all active subprocess processes
   */
  killAllProcesses(): void {
    for (const [id, proc] of this.activeProcesses.entries()) {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Process may have already exited
      }
      this.activeProcesses.delete(id);
    }
  }

  /**
   * Get count of active processes
   */
  getActiveProcessCount(): number {
    return this.activeProcesses.size;
  }

  /**
   * Estimate memory usage of an execution (access base class logic)
   */
  private estimateMemoryUsage(code: string, result: unknown): number {
    const codeSize = code.length / 1024;
    const resultSize = (typeof result === 'string' ? result.length : JSON.stringify(result || '').length) / 1024;
    const baseMB = 10;
    return baseMB + (codeSize + resultSize) / 1024;
  }
}

// ============================================================
// DOCKER SANDBOX ADAPTER — Executes code in Docker containers
// ============================================================

export class DockerSandboxAdapter extends SubprocessSandbox {
  private dockerImage: string;

  constructor(config?: { dockerImage?: string }) {
    super();
    this.dockerImage = config?.dockerImage || 'python:3.11-slim';
  }

  /**
   * Execute code in a Docker container with resource limits
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
    // Check if Docker is available
    const dockerReady = await isDockerAvailable();

    if (!dockerReady) {
      // Fall back to subprocess execution
      this.audit('docker-unavailable', sandboxId, `fallback_${Date.now()}`, 'Docker not available, falling back to subprocess');
      return super.executeCode(code, language, sandboxId, options);
    }

    const sandbox = this.getSandbox(sandboxId) || DEFAULT_SANDBOX_CONFIG;
    const executionId = `docker_exec_${Date.now()}_${++this.executionCounter}`;

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

    this.audit('execute-start', sandboxId, executionId, `Language: ${language}, Method: docker, Image: ${this.dockerImage}, Code length: ${code.length}`);

    execution.status = 'running';
    const startTime = Date.now();

    try {
      switch (language.toLowerCase()) {
        case 'javascript':
        case 'typescript': {
          // For JS, still use the Function()-based approach inside Docker if we want,
          // but for simplicity, use the subprocess approach
          const jsResult = await this.executeJavaScriptDocker(code, sandbox, options.input);
          execution.result = jsResult.result;
          execution.stdout = jsResult.stdout;
          execution.stderr = jsResult.stderr;
          execution.exitCode = jsResult.exitCode;
          break;
        }

        case 'python': {
          const pyResult = await this.executePythonDocker(code, sandbox);
          execution.result = pyResult.result;
          execution.stdout = pyResult.stdout;
          execution.stderr = pyResult.stderr;
          execution.exitCode = pyResult.exitCode;
          break;
        }

        default:
          execution.status = 'failed';
          execution.error = `Langage non supporté en Docker sandbox: ${language}`;
          execution.completedAt = new Date().toISOString();
          return execution;
      }

      execution.executionTimeMs = Date.now() - startTime;
      execution.memoryUsedMB = this.estimateMemoryUsageDocker(code, execution.result);

      // Check resource limits
      if (execution.executionTimeMs > sandbox.maxCpuTimeMs + 5000) {
        // Allow 5s grace for Docker startup overhead
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
   * Execute Python code in a Docker container
   * Uses: docker run --rm --memory=128m --cpus=0.5 --network=none timeout 10s python3 -c "..."
   */
  private executePythonDocker(
    code: string,
    sandbox: SandboxConfig
  ): Promise<{ result: string; stdout: string[]; stderr: string[]; exitCode: number }> {
    return new Promise((resolve) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const timeoutSecs = Math.ceil(sandbox.maxCpuTimeMs / 1000);
      const memoryLimit = `${sandbox.maxMemoryMB}m`;
      const cpuLimit = '0.5';

      // Build the docker run command
      // --rm: auto-remove container after execution
      // --memory: limit memory
      // --cpus: limit CPU
      // --network=none: no network access
      // --read-only: read-only filesystem (except /tmp)
      // --tmpfs /tmp: writable tmp in memory
      const dockerArgs = [
        'run',
        '--rm',
        `--memory=${memoryLimit}`,
        `--cpus=${cpuLimit}`,
        '--network=none',
        '--read-only',
        '--tmpfs', '/tmp:size=10m',
        '--name', `genova_sandbox_${Date.now()}`,
        this.dockerImage,
        'timeout',
        `${timeoutSecs}s`,
        'python3',
        '-c',
        code,
      ];

      const proc = spawn('docker', dockerArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {}, // No environment variables leaked to container
      });

      // Track active process
      const procId = `docker_python_${Date.now()}`;
      this.activeProcesses.set(procId, proc);

      proc.stdout.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        for (const line of text.split('\n')) {
          if (line.trim()) stdout.push(line);
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        for (const line of text.split('\n')) {
          if (line.trim()) stderr.push(line);
        }
      });

      // Hard timeout beyond Docker's own timeout
      const hardTimeout = setTimeout(() => {
        proc.kill('SIGKILL');
        stderr.push(`[DockerSandbox] Process killed: hard timeout after ${timeoutSecs + 10}s`);
      }, (timeoutSecs + 10) * 1000);

      proc.on('close', (code) => {
        clearTimeout(hardTimeout);
        this.activeProcesses.delete(procId);

        // Check if the exit code indicates a timeout
        // timeout command exits with code 124 on timeout
        const exitCode = code ?? 1;
        if (exitCode === 124) {
          stderr.push(`[DockerSandbox] Python execution timed out after ${timeoutSecs}s`);
        }

        resolve({
          result: stdout.join('\n'),
          stdout,
          stderr,
          exitCode,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(hardTimeout);
        this.activeProcesses.delete(procId);
        stderr.push(`[DockerSandbox] Docker error: ${err.message}`);

        // Docker failed — this might mean Docker became unavailable
        dockerAvailableCache = null; // Reset cache

        resolve({
          result: '',
          stdout,
          stderr,
          exitCode: 1,
        });
      });

      // Close stdin
      proc.stdin?.end();
    });
  }

  /**
   * Execute JavaScript in a Docker container using Node.js
   */
  private executeJavaScriptDocker(
    code: string,
    sandbox: SandboxConfig,
    input?: Record<string, unknown>
  ): Promise<{ result: unknown; stdout: string[]; stderr: string[]; exitCode: number }> {
    // For JavaScript, we use the Function()-based approach from SubprocessSandbox
    // Running JS in Docker requires a Node.js image which is larger
    // This is a reasonable trade-off: JS execution is already sandboxed via new Function()
    return this.executeJavaScriptSubprocess(code, sandbox, input);
  }

  /**
   * Estimate memory usage for Docker-based execution
   */
  private estimateMemoryUsageDocker(code: string, result: unknown): number {
    const codeSize = code.length / 1024;
    const resultSize = (typeof result === 'string' ? result.length : JSON.stringify(result || '').length) / 1024;
    const baseMB = 15; // Slightly higher base for Docker overhead
    return baseMB + (codeSize + resultSize) / 1024;
  }
}

// ============================================================
// AUTO-DETECT SANDBOX — Selects the best available execution method
// Priority: Docker > Subprocess > Simulated
// ============================================================

let autoSandboxInstance: SandboxManager | null = null;
let detectedMethod: ExecutionMethod | null = null;

/**
 * Auto-detect and return the best sandbox manager
 */
export async function getAutoSandbox(): Promise<{ sandbox: SandboxManager; method: ExecutionMethod }> {
  if (autoSandboxInstance && detectedMethod) {
    return { sandbox: autoSandboxInstance, method: detectedMethod };
  }

  // Try Docker first
  const dockerReady = await isDockerAvailable();
  if (dockerReady) {
    try {
      autoSandboxInstance = new DockerSandboxAdapter();
      detectedMethod = 'docker';
      console.info('[Sandbox] Auto-detected: Docker container execution');
      return { sandbox: autoSandboxInstance, method: 'docker' };
    } catch (error) {
      console.warn('[Sandbox] Docker available but initialization failed:', error);
    }
  }

  // Try subprocess (check if python3 is available)
  try {
    const pythonCheck = await new Promise<boolean>((resolve) => {
      const proc = spawn('python3', ['--version'], {
        stdio: 'pipe',
        timeout: 5000,
      });

      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));

      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 6000);
    });

    if (pythonCheck) {
      autoSandboxInstance = new SubprocessSandbox();
      detectedMethod = 'subprocess';
      console.info('[Sandbox] Auto-detected: Subprocess execution (python3 available)');
      return { sandbox: autoSandboxInstance, method: 'subprocess' };
    }
  } catch {
    // python3 not available
  }

  // Fall back to simulated execution
  autoSandboxInstance = new SandboxManager();
  detectedMethod = 'simulated';
  console.info('[Sandbox] Auto-detected: Simulated execution (no python3 or Docker)');
  return { sandbox: autoSandboxInstance, method: 'simulated' };
}

/**
 * Get the currently detected execution method
 */
export function getDetectedMethod(): ExecutionMethod | null {
  return detectedMethod;
}

/**
 * Reset the auto-detected sandbox (for testing or re-detection)
 */
export function resetAutoSandbox(): void {
  autoSandboxInstance = null;
  detectedMethod = null;
  resetDockerCache();
}

// ============================================================
// SINGLETON — Backward-compatible with existing code
// ============================================================

let sandboxManagerInstance: SandboxManager | null = null;

export function getSandboxManager(): SandboxManager {
  if (!sandboxManagerInstance) {
    sandboxManagerInstance = new SandboxManager();
  }
  return sandboxManagerInstance;
}

/**
 * Get the best available sandbox manager (async)
 * This is the recommended way to get a sandbox in production
 */
export async function getBestSandboxManager(): Promise<SandboxManager> {
  const { sandbox } = await getAutoSandbox();
  return sandbox;
}
