/**
 * Integration Generator — Genova AI Integration Server
 *
 * Takes the analysis results from the Code Analyzer and auto-generates
 * production-ready integration code: adapter files, API routes, and
 * configuration entries. All generated code follows the exact patterns
 * used in the existing Genova integration-engine.
 *
 * Uses AI Router for code generation with reasoning capabilities.
 */

import { chatCompletion, type AIMessage } from '@/lib/ai-router';
import { createLogger } from '@/lib/logger';
import type { CodeAnalysisResult, DetectedAPI, DetectedModel } from './code-analyzer';

const log = createLogger('integration-generator');

// ============================================================
// Types
// ============================================================

export interface GeneratedAdapter {
  fileName: string;
  filePath: string;
  content: string;
  description: string;
}

export interface GeneratedAPIRoute {
  fileName: string;
  filePath: string;
  content: string;
  description: string;
}

export interface GeneratedConfig {
  integrationId: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  category: string;
  icon: string;
  color: string;
  homepage: string;
  repository: string;
  functions: Array<{
    id: string;
    name: string;
    displayName: string;
    description: string;
    inputSchema: Array<{ name: string; type: string; required: boolean; description: string; defaultValue?: string }>;
    outputSchema: Array<{ name: string; type: string; required: boolean; description: string }>;
    requiresAuth: boolean;
    authType?: string;
    timeoutMs: number;
    costPerCall: number;
    tags: string[];
  }>;
  envVariables: Array<{
    name: string;
    description: string;
    required: boolean;
    defaultValue?: string;
    isSecret: boolean;
  }>;
  apiBaseUrl?: string;
  healthCheckEndpoint?: string;
  fallbackChain: string[];
}

export interface GenerationResult {
  adapter: GeneratedAdapter;
  apiRoutes: GeneratedAPIRoute[];
  config: GeneratedConfig;
  instructions: string;
  warnings: string[];
}

// ============================================================
// Helper Functions
// ============================================================

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    ai_ml: '🤖',
    communication: '💬',
    automation: '🔄',
    database: '🗄️',
    media: '🎨',
    infrastructure: '🔧',
    analytics: '📊',
    other: '📦',
  };
  return icons[category] || '📦';
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    ai_ml: '#8B5CF6',
    communication: '#25D366',
    automation: '#FF6D5A',
    database: '#3B82F6',
    media: '#F59E0B',
    infrastructure: '#6B7280',
    analytics: '#10B981',
    other: '#6B7280',
  };
  return colors[category] || '#6B7280';
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
}

// ============================================================
// Adapter Code Generation (AI-powered)
// ============================================================

async function generateAdapterCode(
  analysis: CodeAnalysisResult,
  projectName: string,
): Promise<GeneratedAdapter> {
  const slug = slugify(projectName);
  const className = `${projectName.replace(/[-_](.)/g, (_, c) => c.toUpperCase())}Adapter`;

  const systemPrompt = `You are an expert TypeScript developer who creates production-ready integration adapters for the Genova SaaS platform.

The adapter MUST follow this exact pattern used by existing adapters in the codebase:

\`\`\`typescript
import type {
  IntegrationAdapter,
  IntegrationConfig,
  ExecutionResult,
  HealthCheckResult,
} from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('adapter-{slug}');

export class ${className} implements IntegrationAdapter {
  readonly config: IntegrationConfig = { ... };

  async initialize(): Promise<void> { ... }
  async execute(functionId: string, params: Record<string, unknown>, userId: string): Promise<ExecutionResult> { ... }
  async healthCheck(): Promise<HealthCheckResult> { ... }
  async shutdown(): Promise<void> { ... }
}
\`\`\`

CRITICAL RULES:
1. The adapter MUST implement the IntegrationAdapter interface exactly
2. Use createLogger for all logging
3. Execute method MUST switch on functionId and dispatch to private methods
4. Each private method returns ExecutionResult with success, data, error, executionTimeMs, provider, costUsd, metadata
5. Health check MUST use AbortController with timeout
6. Implement fallback chain where applicable (primary → fallback providers)
7. Handle ALL error cases gracefully with try/catch
8. Use environment variables with process.env and sensible defaults
9. All timeouts MUST use AbortController
10. Cost is always 0 (Genova is 100% free)
11. NEVER use any or unknown types without proper type guards
12. The code MUST compile without TypeScript errors
13. Write COMPLETE, production-ready code — no placeholders, no TODOs, no "..."`;

  const userPrompt = `Generate a complete TypeScript adapter for this project:

## Project: ${projectName}
## Type: ${analysis.projectType}
## Description: ${analysis.description}

## Detected APIs:
${JSON.stringify(analysis.apis, null, 2).substring(0, 6000)}

## Detected Models:
${JSON.stringify(analysis.models, null, 2).substring(0, 4000)}

## Integration Points:
${JSON.stringify(analysis.integrationPoints, null, 2).substring(0, 4000)}

## Fallback Suggestions:
${JSON.stringify(analysis.fallbackSuggestions, null, 2)}

## Health Check Strategy:
${JSON.stringify(analysis.healthCheckStrategy, null, 2)}

## Config Requirements:
${JSON.stringify(analysis.configRequirements, null, 2).substring(0, 3000)}

## Code Patterns Detected:
${analysis.codePatterns.map(p => `- ${p.pattern}: ${p.description}`).join('\n')}

Generate the COMPLETE adapter TypeScript file. No shortcuts. No placeholders. Every function must be fully implemented.
The adapter slug is: ${slug}
The class name is: ${className}`;

  try {
    const result = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 'powerful');

    let content = result.content.trim();
    // Extract code from markdown code blocks if present
    const codeMatch = content.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
    if (codeMatch) {
      content = codeMatch[1].trim();
    }

    return {
      fileName: `${slug}.ts`,
      filePath: `src/lib/integration-engine/adapters/${slug}.ts`,
      content,
      description: `Integration adapter for ${projectName} — auto-generated by AI Integration Server`,
    };
  } catch (error) {
    log.error('AI adapter generation failed, generating template', { error: error instanceof Error ? error.message : String(error) });
    return generateTemplateAdapter(analysis, projectName, slug, className);
  }
}

/**
 * Fallback template generator when AI generation fails.
 * Produces a working but basic adapter.
 */
function generateTemplateAdapter(
  analysis: CodeAnalysisResult,
  projectName: string,
  slug: string,
  className: string,
): GeneratedAdapter {
  const apiBaseUrl = analysis.healthCheckStrategy.endpoint
    ? `process.env.${slug.toUpperCase().replace(/-/g, '_')}_API_URL || 'http://localhost:8080'`
    : "''";

  const functionsCode = analysis.apis.map(api => {
    const paramValidation = api.inputParams
      .filter(p => p.required)
      .map(p => `if (!params.${p.name}) {
        return {
          success: false,
          error: '${p.name} is required',
          executionTimeMs: Date.now() - startTime,
          provider: '${slug}',
          costUsd: 0,
          metadata: {},
        };
      }`)
      .join('\n      ');

    const fetchBody = api.method === 'GET'
      ? 'undefined'
      : `JSON.stringify(params)`;

    return `
  private async ${api.name.replace(/[^a-zA-Z0-9]/g, '_')}(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    ${paramValidation}

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ${api.rateLimitHint ? '30_000' : '60_000'});

      const res = await fetch(\`\${API_BASE_URL}${api.path}\`, {
        method: '${api.method}',
        headers: { 'Content-Type': 'application/json' },
        body: ${fetchBody},
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(\`${api.name} API error: \${res.status}\`);
      }

      const data = await res.json();
      return {
        success: true,
        data,
        executionTimeMs: Date.now() - startTime,
        provider: '${slug}',
        costUsd: 0,
        metadata: { provider: '${slug}' },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '${api.name} failed',
        executionTimeMs: Date.now() - startTime,
        provider: '${slug}',
        costUsd: 0,
        metadata: {},
      };
    }
  }`;
  }).join('\n');

  const content = `/**
 * ${className} — Genova Integration Engine
 *
 * Auto-generated integration adapter for ${projectName}.
 * ${analysis.description}
 */

import type {
  IntegrationAdapter,
  IntegrationConfig,
  ExecutionResult,
  HealthCheckResult,
} from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('adapter-${slug}');

const API_BASE_URL = ${apiBaseUrl};

export class ${className} implements IntegrationAdapter {
  readonly config: IntegrationConfig = {
    id: '${slug}',
    name: '${slug}',
    displayName: '${projectName}',
    description: '${analysis.description}',
    version: '1.0.0',
    category: '${analysis.projectType.includes('python') || analysis.projectType.includes('ml') ? 'ai_ml' : 'other'}',
    icon: '${getCategoryIcon(analysis.projectType.includes('python') || analysis.projectType.includes('ml') ? 'ai_ml' : 'other')}',
    color: '${getCategoryColor(analysis.projectType.includes('python') || analysis.projectType.includes('ml') ? 'ai_ml' : 'other')}',
    homepage: '',
    repository: '',
    status: 'discovered',
    functions: [],
    dependencies: ${JSON.stringify(analysis.dependencies.external.slice(0, 20))},
    envVariables: ${JSON.stringify(analysis.configRequirements.map(c => ({
      name: c.key,
      description: c.description,
      required: c.required,
      defaultValue: c.defaultValue,
      isSecret: c.isSecret,
    })))},
    apiBaseUrl: API_BASE_URL,
    metadata: { autoGenerated: true },
  };

  async initialize(): Promise<void> {
    log.info('${projectName} adapter initializing');
    const health = await this.healthCheck();
    if (!health.healthy) {
      log.warn('${projectName} health check failed on init', { error: health.error });
    }
  }

  async execute(functionId: string, params: Record<string, unknown>, _userId: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    switch (functionId) {
${analysis.apis.map(api => `      case '${api.name}':
        return this.${api.name.replace(/[^a-zA-Z0-9]/g, '_')}(params);`).join('\n')}
      default:
        return {
          success: false,
          error: \`Unknown function: \${functionId}\`,
          executionTimeMs: Date.now() - startTime,
          provider: '${slug}',
          costUsd: 0,
          metadata: {},
        };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      ${analysis.healthCheckStrategy.endpoint
        ? `const res = await fetch(\`\${API_BASE_URL}${analysis.healthCheckStrategy.endpoint}\`, {
        method: '${analysis.healthCheckStrategy.method || 'GET'}',
        signal: controller.signal,
      });
      clearTimeout(timer);

      return {
        healthy: res.ok,
        responseTimeMs: Date.now() - start,
        checkedAt: new Date(),
      };`
        : `clearTimeout(timer);
      return {
        healthy: true,
        responseTimeMs: Date.now() - start,
        checkedAt: new Date(),
      };`}
    } catch (error) {
      return {
        healthy: false,
        responseTimeMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Health check failed',
        checkedAt: new Date(),
      };
    }
  }

  async shutdown(): Promise<void> {
    log.info('${projectName} adapter shutting down');
  }

${functionsCode}
}
`;

  return {
    fileName: `${slug}.ts`,
    filePath: `src/lib/integration-engine/adapters/${slug}.ts`,
    content,
    description: `Template adapter for ${projectName} — auto-generated (AI generation failed)`,
  };
}

// ============================================================
// API Route Generation
// ============================================================

async function generateAPIRoutes(
  analysis: CodeAnalysisResult,
  projectName: string,
): Promise<GeneratedAPIRoute[]> {
  const slug = slugify(projectName);
  const routes: GeneratedAPIRoute[] = [];

  // Main integration status route
  const statusRoute: GeneratedAPIRoute = {
    fileName: 'route.ts',
    filePath: `src/app/api/integrations/${slug}/route.ts`,
    content: generateAPIRouteCode(slug, projectName, analysis),
    description: `API routes for ${projectName} integration`,
  };
  routes.push(statusRoute);

  // Execute route
  const executeRoute: GeneratedAPIRoute = {
    fileName: 'route.ts',
    filePath: `src/app/api/integrations/${slug}/execute/route.ts`,
    content: generateExecuteRouteCode(slug, projectName),
    description: `Execute endpoint for ${projectName} integration functions`,
  };
  routes.push(executeRoute);

  return routes;
}

function generateAPIRouteCode(slug: string, projectName: string, analysis: CodeAnalysisResult): string {
  return `/**
 * GET /api/integrations/${slug} — ${projectName} Integration Status
 * POST /api/integrations/${slug} — Manage ${projectName} Integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationRegistry } from '@/lib/integration-engine/registry';
import { getIntegrationExecutor } from '@/lib/integration-engine/executor';

export async function GET(_request: NextRequest) {
  try {
    const registry = getIntegrationRegistry();
    const config = registry.getById('${slug}');

    if (!config) {
      return NextResponse.json(
        { success: false, error: '${projectName} integration not registered' },
        { status: 404 },
      );
    }

    const health = await registry.checkHealth('${slug}');

    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        name: config.displayName,
        status: config.status,
        functions: config.functions.map(f => ({
          id: f.id,
          name: f.name,
          displayName: f.displayName,
          description: f.description,
          category: f.category,
        })),
        health,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get ${slug} status' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId } = body;

    const registry = getIntegrationRegistry();

    switch (action) {
      case 'activate': {
        if (!userId) {
          return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
        }
        await registry.activate('${slug}', userId);
        return NextResponse.json({ success: true, message: '${projectName} activated' });
      }
      case 'deactivate': {
        if (!userId) {
          return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
        }
        await registry.deactivate('${slug}', userId);
        return NextResponse.json({ success: true, message: '${projectName} deactivated' });
      }
      case 'health': {
        const health = await registry.checkHealth('${slug}');
        return NextResponse.json({ success: true, data: health });
      }
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Use: activate, deactivate, health' },
          { status: 400 },
        );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 },
    );
  }
}
`;
}

function generateExecuteRouteCode(slug: string, projectName: string): string {
  return `/**
 * POST /api/integrations/${slug}/execute — Execute ${projectName} Function
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationExecutor } from '@/lib/integration-engine/executor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { functionId, params, userId, timeoutMs, priority } = body;

    if (!functionId) {
      return NextResponse.json(
        { success: false, error: 'functionId is required' },
        { status: 400 },
      );
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 },
      );
    }

    const executor = getIntegrationExecutor();
    const result = await executor.execute({
      integrationId: '${slug}',
      functionId,
      params: params || {},
      userId,
      timeoutMs,
      priority: priority || 'normal',
    });

    return NextResponse.json({
      success: result.success,
      data: result.data,
      error: result.error,
      executionTimeMs: result.executionTimeMs,
      provider: result.provider,
      costUsd: result.costUsd,
      metadata: result.metadata,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Execution failed' },
      { status: 500 },
    );
  }
}
`;
}

// ============================================================
// Config Generation
// ============================================================

function generateConfig(
  analysis: CodeAnalysisResult,
  projectName: string,
): GeneratedConfig {
  const slug = slugify(projectName);
  const category = analysis.projectType.includes('python') || analysis.projectType.includes('ml')
    ? 'ai_ml'
    : analysis.projectType.includes('api')
      ? 'infrastructure'
      : 'other';

  return {
    integrationId: slug,
    name: slug,
    displayName: projectName,
    description: analysis.description,
    version: '1.0.0',
    category,
    icon: getCategoryIcon(category),
    color: getCategoryColor(category),
    homepage: '',
    repository: '',
    functions: analysis.apis.map(api => ({
      id: `${slug}-${api.name}`,
      name: api.name,
      displayName: api.name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: api.description,
      inputSchema: api.inputParams.map(p => ({
        name: p.name,
        type: p.type as 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' | 'stream',
        required: p.required,
        description: p.description,
        defaultValue: p.defaultValue,
      })),
      outputSchema: api.outputFields.map(f => ({
        name: f.name,
        type: f.type as 'string' | 'number' | 'boolean' | 'object' | 'array',
        required: true,
        description: f.description,
      })),
      requiresAuth: api.authRequired,
      authType: api.authType,
      timeoutMs: 30_000,
      costPerCall: 0,
      tags: [category, api.method.toLowerCase()],
    })),
    envVariables: analysis.configRequirements.map(c => ({
      name: c.key,
      description: c.description,
      required: c.required,
      defaultValue: c.defaultValue,
      isSecret: c.isSecret,
    })),
    apiBaseUrl: analysis.healthCheckStrategy.endpoint
      ? `process.env.${slug.toUpperCase().replace(/-/g, '_')}_API_URL || 'http://localhost:8080'`
      : undefined,
    healthCheckEndpoint: analysis.healthCheckStrategy.endpoint,
    fallbackChain: analysis.fallbackSuggestions.map(fb => fb.for),
  };
}

// ============================================================
// Instructions Generation
// ============================================================

async function generateInstructions(
  analysis: CodeAnalysisResult,
  projectName: string,
  config: GeneratedConfig,
): Promise<string> {
  const slug = slugify(projectName);
  const envSetup = config.envVariables
    .filter(v => v.required)
    .map(v => `${v.name}=your_${v.name.toLowerCase()}_here`)
    .join('\n');

  return `# Integration Guide: ${projectName}

## Overview
${analysis.description}

## Readiness Score: ${analysis.readinessScore}/100
Analysis Confidence: ${Math.round(analysis.analysisConfidence * 100)}%

## Steps to Complete Integration

### 1. Install the Adapter
Copy the generated adapter file to:
\`\`\`
src/lib/integration-engine/adapters/${slug}.ts
\`\`\`

### 2. Register in Integration Engine
Add to \`src/lib/integration-engine/index.ts\`:
\`\`\`typescript
import { ${projectName.replace(/[-_](.)/g, (_, c) => c.toUpperCase())}Adapter } from './adapters/${slug}';
\`\`\`
And add to the adapters array:
\`\`\`typescript
new ${projectName.replace(/[-_](.)/g, (_, c) => c.toUpperCase())}Adapter(),
\`\`\`

### 3. Configure Environment Variables
Add to your \`.env\` file:
\`\`\`
${envSetup || '# No required environment variables'}
\`\`\`

### 4. API Routes
The following API routes have been generated:
- \`GET /api/integrations/${slug}\` — Get integration status
- \`POST /api/integrations/${slug}\` — Activate/deactivate integration
- \`POST /api/integrations/${slug}/execute\` — Execute integration functions

### 5. Available Functions
${config.functions.map(f => `- **${f.displayName}** (\`${f.name}\`): ${f.description}`).join('\n') || 'No functions detected'}

### 6. Fallback Chain
${analysis.fallbackSuggestions.length > 0
    ? analysis.fallbackSuggestions.map(fb => `- **${fb.for}**: ${fb.fallbacks.join(' → ')} (${fb.reason})`).join('\n')
    : 'No fallback suggestions available'}

### 7. Health Check
${analysis.healthCheckStrategy.endpoint
    ? `Endpoint: \`${analysis.healthCheckStrategy.method || 'GET'} ${analysis.healthCheckStrategy.endpoint}\``
    : 'No health check endpoint detected — custom logic may be needed'}

### 8. Dependencies
External: ${analysis.dependencies.external.slice(0, 20).join(', ') || 'None detected'}
${analysis.dependencies.missing.length > 0 ? `\nMissing (need installation): ${analysis.dependencies.missing.join(', ')}` : ''}

## Code Patterns Detected
${analysis.codePatterns.map(p => `- **${p.pattern}** (${p.significance}): ${p.description}`).join('\n') || 'None'}
`;
}

// ============================================================
// Main Generator
// ============================================================

export interface GenerationOptions {
  analysis: CodeAnalysisResult;
  projectName: string;
  repository?: string;
}

/**
 * Generate complete integration code from analysis results.
 */
export async function generateIntegration(options: GenerationOptions): Promise<GenerationResult> {
  const { analysis, projectName } = options;
  const startTime = Date.now();

  log.info('Starting integration code generation', { project: projectName });

  const warnings: string[] = [];

  if (analysis.readinessScore < 40) {
    warnings.push(`Low readiness score (${analysis.readinessScore}/100). Integration may require manual adjustments.`);
  }

  if (analysis.dependencies.missing.length > 0) {
    warnings.push(`Missing dependencies detected: ${analysis.dependencies.missing.join(', ')}. Install them before activating.`);
  }

  if (analysis.apis.length === 0 && analysis.models.length === 0) {
    warnings.push('No APIs or models detected. The adapter will be a template with no executable functions.');
  }

  // Generate adapter code using AI
  const adapter = await generateAdapterCode(analysis, projectName);

  // Generate API routes
  const apiRoutes = await generateAPIRoutes(analysis, projectName);

  // Generate config
  const config = generateConfig(analysis, projectName);

  // Generate instructions
  const instructions = await generateInstructions(analysis, projectName, config);

  log.info('Integration code generation complete', {
    project: projectName,
    adapterSize: adapter.content.length,
    routesCount: apiRoutes.length,
    functionsCount: config.functions.length,
    warnings: warnings.length,
    durationMs: Date.now() - startTime,
  });

  return {
    adapter,
    apiRoutes,
    config,
    instructions,
    warnings,
  };
}
