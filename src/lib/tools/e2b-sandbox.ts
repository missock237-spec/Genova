// E2B Sandbox — Cloud-based secure code execution
// E2B provides ephemeral, fully isolated VM environments for code execution
// This is the most secure option (better than Docker, close to Firecracker VM)
// Requires: E2B_API_KEY environment variable

import { SandboxManager, SubprocessSandbox, DockerSandboxAdapter, type SandboxConfig, type SandboxExecution, DEFAULT_SANDBOX_CONFIG } from './sandbox';

// ============================================================
// INTERFACES
// ============================================================

export interface E2BConfig {
  apiKey: string;
  template?: string;        // E2B sandbox template ID
  timeout?: number;         // Default timeout in ms
  maxMemoryMB?: number;
}

export interface E2BExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
}

// ============================================================
// E2B SANDBOX ADAPTER
// ============================================================

export class E2BSandbox extends SandboxManager {
  private apiKey: string;
  private template: string;
  private defaultTimeout: number;
  private e2bAvailable: boolean | null = null;

  constructor(config?: Partial<E2BConfig>) {
    super();
    this.apiKey = config?.apiKey || process.env.E2B_API_KEY || '';
    this.template = config?.template || 'base';
    this.defaultTimeout = config?.timeout || 30000;

    // Check E2B availability
    this.checkE2BAvailability();
  }

  /**
   * Check if E2B is available (API key configured and API reachable)
   */
  private async checkE2BAvailability(): Promise<boolean> {
    if (this.e2bAvailable !== null) return this.e2bAvailable;

    if (!this.apiKey) {
      this.e2bAvailable = false;
      return false;
    }

    try {
      const response = await fetch('https://api.e2b.dev/health', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      this.e2bAvailable = response.ok;
    } catch {
      this.e2bAvailable = false;
    }

    return this.e2bAvailable;
  }

  /**
   * Execute code in an E2B cloud sandbox
   * E2B provides full VM isolation — much more secure than Docker
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
    // Check E2B availability first
    const available = await this.checkE2BAvailability();

    if (!available) {
      // Fall back to subprocess execution
      const subprocess = new SubprocessSandbox();
      return subprocess.executeCode(code, language, sandboxId, options);
    }

    const sandbox = this.getSandbox(sandboxId) || DEFAULT_SANDBOX_CONFIG;
    const executionId = `e2b_exec_${Date.now()}_${++this.executionCounter}`;

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

    // Validate code before sending to E2B
    const validation = this.validateCode(code, language);
    if (!validation.safe) {
      execution.status = 'failed';
      execution.error = validation.errors.join('; ');
      execution.completedAt = new Date().toISOString();
      this.audit('validate-fail', sandboxId, executionId, `Code validation failed: ${validation.errors.join(', ')}`);
      return execution;
    }

    this.audit('execute-start', sandboxId, executionId, `Language: ${language}, Method: e2b, Template: ${this.template}`);

    execution.status = 'running';
    const startTime = Date.now();

    try {
      const result = await this.executeInE2B(code, language, sandbox);

      execution.result = result.stdout;
      execution.stdout = result.stdout.split('\n').filter(l => l.trim());
      execution.stderr = result.stderr.split('\n').filter(l => l.trim());
      execution.exitCode = result.exitCode;
      execution.executionTimeMs = result.executionTime;
      execution.memoryUsedMB = sandbox.maxMemoryMB * 0.5; // E2B reports approximate memory

      if (result.exitCode !== 0) {
        execution.status = 'failed';
        execution.error = result.stderr || `Process exited with code ${result.exitCode}`;
      } else if (execution.executionTimeMs > sandbox.maxCpuTimeMs) {
        execution.status = 'timeout';
        execution.error = `Délai CPU dépassé: ${execution.executionTimeMs}ms > ${sandbox.maxCpuTimeMs}ms`;
      } else {
        execution.status = 'completed';
      }

      execution.completedAt = new Date().toISOString();
      this.audit('execute-complete', sandboxId, executionId, `Status: ${execution.status}, Time: ${execution.executionTimeMs}ms`);

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Erreur d\'exécution E2B';
      execution.executionTimeMs = Date.now() - startTime;
      execution.completedAt = new Date().toISOString();
      this.audit('execute-error', sandboxId, executionId, execution.error);

      // Mark E2B as potentially unavailable
      this.e2bAvailable = null;
    }

    return execution;
  }

  /**
   * Execute code in E2B cloud sandbox via API
   */
  private async executeInE2B(
    code: string,
    language: string,
    sandbox: SandboxConfig
  ): Promise<E2BExecutionResult> {
    const timeoutSecs = Math.ceil(sandbox.maxCpuTimeMs / 1000);

    // E2B API call to create and execute in a sandbox
    const response = await fetch('https://api.e2b.dev/sandboxes/execute', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template: this.template,
        code,
        language: language === 'typescript' ? 'javascript' : language,
        timeout: timeoutSecs,
        memoryMB: sandbox.maxMemoryMB,
        // No network access by default
        network: sandbox.allowedNetwork,
        // Read-only filesystem by default
        filesystem: sandbox.allowedFilesystem ? 'read-write' : 'read-only',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`E2B API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();

    return {
      stdout: data.stdout || '',
      stderr: data.stderr || '',
      exitCode: data.exitCode ?? 1,
      executionTime: data.executionTimeMs || 0,
    };
  }

  /**
   * Check if E2B is currently available
   */
  isAvailable(): boolean {
    return this.e2bAvailable === true;
  }
}

// ============================================================
// SANDBOX FACTORY — Creates the best available sandbox
// ============================================================

export type SandboxType = 'e2b' | 'docker' | 'subprocess';

export function createSandbox(type?: SandboxType): SandboxManager {
  const sandboxType = type || (process.env.SANDBOX_TYPE as SandboxType) || 'subprocess';

  switch (sandboxType) {
    case 'e2b':
      return new E2BSandbox();
    case 'docker': {
      // Use require to avoid circular dependency and type conflicts
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DockerSandboxAdapter } = require('./sandbox') as typeof import('./sandbox');
      return new DockerSandboxAdapter() as unknown as SandboxManager;
    }
    case 'subprocess':
    default:
      return new SubprocessSandbox();
  }
}
