/**
 * AI Integration Server — Genova AgentOS
 *
 * The central orchestrator that ties together:
 * - Code Analyzer: Deep AI analysis of open-source project code
 * - Integration Generator: Auto-generates adapter, API routes, config
 * - SaaS Doctor: Continuous health monitoring and diagnostics
 *
 * Pipeline: Upload → Analyze → Generate → Register → Verify → Activate
 */

import { analyzeCode, type CodeFile, type CodeAnalysisResult } from './code-analyzer';
import { generateIntegration, type GenerationResult } from './integration-generator';
import { runDiagnostics, quickHealthCheck, type DiagnosticReport } from './saas-doctor';
import { getIntegrationRegistry } from '@/lib/integration-engine/registry';
import { initializeIntegrationEngine } from '@/lib/integration-engine';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('ai-integration-server');

// ============================================================
// Types
// ============================================================

export type PipelineStatus =
  | 'idle'
  | 'analyzing'
  | 'generating'
  | 'registering'
  | 'verifying'
  | 'activating'
  | 'completed'
  | 'failed';

export interface PipelineProgress {
  status: PipelineStatus;
  currentStep: string;
  totalSteps: number;
  currentStepIndex: number;
  percentage: number;
  startedAt: Date;
  estimatedCompletionMs?: number;
}

export interface IntegrationPipelineResult {
  success: boolean;
  projectName: string;
  analysis: CodeAnalysisResult;
  generation: GenerationResult;
  registrationStatus: 'registered' | 'skipped' | 'failed';
  activationStatus: 'activated' | 'pending' | 'failed';
  healthReport?: DiagnosticReport;
  error?: string;
  totalDurationMs: number;
}

export interface ServerStatus {
  status: 'running' | 'idle' | 'error';
  pipeline: PipelineProgress | null;
  lastDiagnostic?: DiagnosticReport;
  stats: {
    totalIntegrationsProcessed: number;
    successfulIntegrations: number;
    failedIntegrations: number;
    lastIntegrationAt?: Date;
  };
}

// ============================================================
// Pipeline Progress Tracking
// ============================================================

let currentPipeline: PipelineProgress | null = null;
let serverStats = {
  totalIntegrationsProcessed: 0,
  successfulIntegrations: 0,
  failedIntegrations: 0,
  lastIntegrationAt: undefined as Date | undefined,
};

function updatePipeline(status: PipelineStatus, step: string, stepIndex: number, totalSteps: number): void {
  if (currentPipeline) {
    currentPipeline.status = status;
    currentPipeline.currentStep = step;
    currentPipeline.currentStepIndex = stepIndex;
    currentPipeline.percentage = Math.round((stepIndex / totalSteps) * 100);
  }
}

// ============================================================
// Main Integration Pipeline
// ============================================================

const PIPELINE_STEPS = [
  { key: 'analyzing', label: 'Analyzing source code with AI' },
  { key: 'generating', label: 'Generating integration code' },
  { key: 'registering', label: 'Registering integration' },
  { key: 'verifying', label: 'Verifying SaaS health' },
  { key: 'activating', label: 'Activating integration' },
];

export interface ProcessProjectOptions {
  files: CodeFile[];
  projectName: string;
  repository?: string;
  readmeContent?: string;
  autoActivate?: boolean;
  userId?: string;
}

/**
 * Process an open-source project through the full AI integration pipeline.
 *
 * Step 1: Analyze — Deep AI analysis of the source code
 * Step 2: Generate — Auto-generate adapter, routes, config
 * Step 3: Register — Register the integration in the engine
 * Step 4: Verify — Run SaaS diagnostics to ensure health
 * Step 5: Activate — Optionally activate the integration
 */
export async function processProject(options: ProcessProjectOptions): Promise<IntegrationPipelineResult> {
  const startTime = Date.now();
  const { files, projectName, repository, readmeContent, autoActivate, userId } = options;
  const totalSteps = PIPELINE_STEPS.length;

  currentPipeline = {
    status: 'analyzing',
    currentStep: PIPELINE_STEPS[0].label,
    totalSteps,
    currentStepIndex: 0,
    percentage: 0,
    startedAt: new Date(),
  };

  log.info('Starting integration pipeline', { project: projectName, fileCount: files.length });

  try {
    // ============================================================
    // STEP 1: ANALYZE
    // ============================================================
    updatePipeline('analyzing', PIPELINE_STEPS[0].label, 0, totalSteps);

    const analysis = await analyzeCode({
      files,
      projectName,
      repository,
      readmeContent,
    });

    log.info('Analysis complete', {
      project: projectName,
      apis: analysis.apis.length,
      models: analysis.models.length,
      readiness: analysis.readinessScore,
    });

    // ============================================================
    // STEP 2: GENERATE
    // ============================================================
    updatePipeline('generating', PIPELINE_STEPS[1].label, 1, totalSteps);

    const generation = await generateIntegration({
      analysis,
      projectName,
      repository,
    });

    log.info('Generation complete', {
      project: projectName,
      adapterSize: generation.adapter.content.length,
      routesCount: generation.apiRoutes.length,
      warnings: generation.warnings.length,
    });

    // ============================================================
    // STEP 3: REGISTER
    // ============================================================
    updatePipeline('registering', PIPELINE_STEPS[2].label, 2, totalSteps);

    const slug = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    let registrationStatus: 'registered' | 'skipped' | 'failed' = 'skipped';

    try {
      // Ensure integration engine is initialized
      await initializeIntegrationEngine();

      const registry = getIntegrationRegistry();

      // Check if already registered
      const existing = registry.getById(slug);
      if (existing) {
        log.info('Integration already registered, updating', { id: slug });
      }

      // Register the generated adapter as a dynamic adapter
      // The adapter code is stored for later compilation and loading
      registry.register({
        config: {
          id: slug,
          name: slug,
          displayName: generation.config.displayName,
          description: generation.config.description,
          version: generation.config.version,
          category: generation.config.category as 'ai_ml' | 'communication' | 'automation' | 'database' | 'media' | 'infrastructure' | 'analytics' | 'other',
          icon: generation.config.icon,
          color: generation.config.color,
          homepage: generation.config.homepage,
          repository: generation.config.repository || repository || '',
          status: 'discovered',
          functions: generation.config.functions.map(f => ({
            id: f.id,
            name: f.name,
            displayName: f.displayName,
            description: f.description,
            category: generation.config.category as 'ai_ml' | 'communication' | 'automation' | 'database' | 'media' | 'infrastructure' | 'analytics' | 'other',
            inputSchema: f.inputSchema.map(p => ({
              name: p.name,
              type: p.type as 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' | 'stream',
              required: p.required,
              description: p.description,
              defaultValue: p.defaultValue,
            })),
            outputSchema: f.outputSchema.map(p => ({
              name: p.name,
              type: p.type as 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' | 'stream',
              required: p.required,
              description: p.description,
            })),
            requiresAuth: f.requiresAuth,
            authType: f.authType as 'api_key' | 'oauth' | 'token' | 'basic' | undefined,
            timeoutMs: f.timeoutMs,
            costPerCall: f.costPerCall,
            tags: f.tags,
          })),
          dependencies: [],
          envVariables: generation.config.envVariables,
          apiBaseUrl: generation.config.apiBaseUrl,
          metadata: {
            autoGenerated: true,
            analysisConfidence: analysis.analysisConfidence,
            readinessScore: analysis.readinessScore,
            generatedAt: new Date().toISOString(),
          },
        },
        initialize: async () => {
          log.info('Auto-generated adapter initialized', { project: projectName });
        },
        execute: async (functionId: string, params: Record<string, unknown>) => {
          // Dynamic execution via the generated adapter code
          // In production, this would load and execute the compiled adapter
          return {
            success: false,
            error: `Integration "${projectName}" is registered but requires activation. Function: ${functionId}`,
            executionTimeMs: 0,
            provider: slug,
            costUsd: 0,
            metadata: { autoGenerated: true, functionId },
          };
        },
        healthCheck: async () => {
          // Use the detected health check strategy
          if (analysis.healthCheckStrategy.endpoint) {
            try {
              const start = Date.now();
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 5000);

              const res = await fetch(
                `${generation.config.apiBaseUrl}${analysis.healthCheckStrategy.endpoint}`,
                {
                  method: analysis.healthCheckStrategy.method || 'GET',
                  signal: controller.signal,
                },
              );
              clearTimeout(timer);

              return {
                healthy: res.ok,
                responseTimeMs: Date.now() - start,
                checkedAt: new Date(),
              };
            } catch {
              return {
                healthy: false,
                responseTimeMs: 0,
                error: 'Health check failed',
                checkedAt: new Date(),
              };
            }
          }
          return {
            healthy: true,
            responseTimeMs: 0,
            checkedAt: new Date(),
          };
        },
        shutdown: async () => {
          log.info('Auto-generated adapter shut down', { project: projectName });
        },
      });

      registrationStatus = 'registered';

      // Persist generated code to database for later retrieval
      if (userId) {
        await db.userResource.upsert({
          where: { id: slug },
          create: {
            id: slug,
            type: 'ai_integration',
            name: generation.config.displayName,
            config: JSON.stringify({
              adapterCode: generation.adapter.content,
              apiRoutes: generation.apiRoutes.map(r => ({ path: r.filePath, code: r.content })),
              analysis: {
                readinessScore: analysis.readinessScore,
                apis: analysis.apis.length,
                models: analysis.models.length,
                confidence: analysis.analysisConfidence,
              },
              generation: {
                warnings: generation.warnings,
                generatedAt: new Date().toISOString(),
              },
            }),
            endpoint: generation.config.apiBaseUrl,
            isActive: false,
            userId,
          },
          update: {
            type: 'ai_integration',
            name: generation.config.displayName,
            config: JSON.stringify({
              adapterCode: generation.adapter.content,
              apiRoutes: generation.apiRoutes.map(r => ({ path: r.filePath, code: r.content })),
              analysis: {
                readinessScore: analysis.readinessScore,
                apis: analysis.apis.length,
                models: analysis.models.length,
                confidence: analysis.analysisConfidence,
              },
              generation: {
                warnings: generation.warnings,
                generatedAt: new Date().toISOString(),
              },
            }),
          },
        });
      }
    } catch (regError) {
      log.error('Registration failed', { error: regError instanceof Error ? regError.message : String(regError) });
      registrationStatus = 'failed';
    }

    // ============================================================
    // STEP 4: VERIFY
    // ============================================================
    updatePipeline('verifying', PIPELINE_STEPS[3].label, 3, totalSteps);

    let healthReport: DiagnosticReport | undefined;
    try {
      healthReport = await runDiagnostics();
    } catch (diagError) {
      log.warn('Diagnostics failed during pipeline', { error: diagError instanceof Error ? diagError.message : String(diagError) });
    }

    // ============================================================
    // STEP 5: ACTIVATE
    // ============================================================
    let activationStatus: 'activated' | 'pending' | 'failed' = 'pending';

    if (autoActivate && userId && registrationStatus === 'registered') {
      updatePipeline('activating', PIPELINE_STEPS[4].label, 4, totalSteps);

      try {
        const registry = getIntegrationRegistry();
        await registry.activate(slug, userId);
        activationStatus = 'activated';
      } catch (actError) {
        log.warn('Auto-activation failed', { error: actError instanceof Error ? actError.message : String(actError) });
        activationStatus = 'failed';
      }
    }

    // Update pipeline
    updatePipeline('completed', 'Integration pipeline completed', totalSteps, totalSteps);

    serverStats.totalIntegrationsProcessed++;
    serverStats.successfulIntegrations++;
    serverStats.lastIntegrationAt = new Date();

    log.info('Integration pipeline completed', {
      project: projectName,
      registrationStatus,
      activationStatus,
      durationMs: Date.now() - startTime,
    });

    return {
      success: true,
      projectName,
      analysis,
      generation,
      registrationStatus,
      activationStatus,
      healthReport,
      totalDurationMs: Date.now() - startTime,
    };
  } catch (error) {
    currentPipeline!.status = 'failed';
    serverStats.totalIntegrationsProcessed++;
    serverStats.failedIntegrations++;

    log.error('Integration pipeline failed', {
      project: projectName,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      projectName,
      analysis: {} as CodeAnalysisResult,
      generation: {} as GenerationResult,
      registrationStatus: 'failed',
      activationStatus: 'failed',
      error: error instanceof Error ? error.message : 'Pipeline failed',
      totalDurationMs: Date.now() - startTime,
    };
  } finally {
    // Keep pipeline info for a while for status queries
    setTimeout(() => {
      if (currentPipeline?.status === 'completed' || currentPipeline?.status === 'failed') {
        currentPipeline = null;
      }
    }, 30_000);
  }
}

// ============================================================
// Server Status API
// ============================================================

/**
 * Get the current status of the AI Integration Server.
 */
export function getServerStatus(): ServerStatus {
  return {
    status: currentPipeline ? 'running' : 'idle',
    pipeline: currentPipeline,
    stats: { ...serverStats },
  };
}

/**
 * Get the current pipeline progress.
 */
export function getPipelineProgress(): PipelineProgress | null {
  return currentPipeline;
}

/**
 * Run diagnostics on the SaaS.
 */
export async function diagnoseSaaS(): Promise<DiagnosticReport> {
  const report = await runDiagnostics();
  return report;
}

/**
 * Quick health check.
 */
export async function checkHealth(): Promise<{ health: number; status: DiagnosticReport['status'] }> {
  return quickHealthCheck();
}

// ============================================================
// Re-exports
// ============================================================

export { analyzeCode } from './code-analyzer';
export { generateIntegration } from './integration-generator';
export { runDiagnostics, quickHealthCheck } from './saas-doctor';

export type { CodeFile, CodeAnalysisResult } from './code-analyzer';
export type { GenerationResult, GeneratedConfig } from './integration-generator';
export type { DiagnosticReport, DiagnosticCheck } from './saas-doctor';
