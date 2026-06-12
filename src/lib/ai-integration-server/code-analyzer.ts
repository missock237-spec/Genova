/**
 * AI Code Analyzer — Genova AI Integration Server
 *
 * Uses the AI Router (Groq → OpenRouter → z-ai-sdk) to deeply analyze
 * open-source project source code, extract APIs, detect patterns,
 * identify integration points, and produce structured analysis results.
 *
 * This is NOT a keyword scanner — it uses LLM reasoning to truly
 * understand code semantics, data flows, and integration requirements.
 */

import { chatCompletion, type AIMessage } from '@/lib/ai-router';
import { createLogger } from '@/lib/logger';

const log = createLogger('ai-code-analyzer');

// ============================================================
// Types
// ============================================================

export interface CodeFile {
  path: string;
  content: string;
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'json' | 'yaml' | 'markdown' | 'unknown';
}

export interface DetectedAPI {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'WS' | 'GRPC';
  path: string;
  description: string;
  inputParams: Array<{
    name: string;
    type: string;
    required: boolean;
    defaultValue?: string;
    description: string;
  }>;
  outputFields: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  authRequired: boolean;
  authType?: 'api_key' | 'bearer' | 'basic' | 'oauth' | 'none';
  rateLimitHint?: string;
}

export interface DetectedEvent {
  name: string;
  description: string;
  triggerCondition: string;
  payloadSchema: Array<{ name: string; type: string; description: string }>;
}

export interface DetectedModel {
  name: string;
  type: 'llm' | 'asr' | 'tts' | 'image_gen' | 'video_gen' | 'embedding' | 'classification' | 'other';
  description: string;
  inputFormat: string;
  outputFormat: string;
  endpoint?: string;
}

export interface DependencyGraph {
  internal: Array<{ from: string; to: string; type: 'import' | 'calls' | 'extends' | 'implements' }>;
  external: string[];
  missing: string[];
}

export interface CodeAnalysisResult {
  projectType: 'node_api' | 'python_ml' | 'python_api' | 'go_api' | 'fullstack' | 'library' | 'cli' | 'unknown';
  primaryLanguage: string;
  frameworks: string[];
  description: string;
  apis: DetectedAPI[];
  events: DetectedEvent[];
  models: DetectedModel[];
  dependencies: DependencyGraph;
  configRequirements: Array<{
    key: string;
    type: string;
    required: boolean;
    defaultValue?: string;
    isSecret: boolean;
    description: string;
  }>;
  integrationPoints: Array<{
    type: 'api_endpoint' | 'sdk_function' | 'event_hook' | 'callback' | 'middleware';
    name: string;
    description: string;
    suggestedAdapter: string;
    complexity: 'simple' | 'moderate' | 'complex';
  }>;
  codePatterns: Array<{
    pattern: string;
    description: string;
    locations: string[];
    significance: 'critical' | 'important' | 'minor';
  }>;
  fallbackSuggestions: Array<{
    for: string;
    fallbacks: string[];
    reason: string;
  }>;
  healthCheckStrategy: {
    endpoint?: string;
    method?: string;
    expectedStatus?: number;
    expectedBody?: string;
    customLogic?: string;
  };
  readinessScore: number;
  analysisConfidence: number;
}

// ============================================================
// Language Detection
// ============================================================

function detectLanguage(filePath: string): CodeFile['language'] {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, CodeFile['language']> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    py: 'python', pyw: 'python',
    go: 'go',
    rs: 'rust',
    json: 'json',
    yml: 'yaml', yaml: 'yaml',
    md: 'markdown', mdx: 'markdown',
  };
  return map[ext] || 'unknown';
}

// ============================================================
// Code File Preprocessing
// ============================================================

function preprocessFiles(files: CodeFile[]): {
  coreFiles: CodeFile[];
  configFiles: CodeFile[];
  apiFiles: CodeFile[];
  modelFiles: CodeFile[];
  summary: string;
} {
  const coreFiles: CodeFile[] = [];
  const configFiles: CodeFile[] = [];
  const apiFiles: CodeFile[] = [];
  const modelFiles: CodeFile[] = [];

  for (const file of files) {
    const pathLower = file.path.toLowerCase();

    if (
      pathLower.includes('package.json') ||
      pathLower.includes('setup.py') ||
      pathLower.includes('pyproject.toml') ||
      pathLower.includes('requirements') ||
      pathLower.includes('.env') ||
      pathLower.includes('config') ||
      pathLower.includes('docker') ||
      pathLower.includes('dockerfile')
    ) {
      configFiles.push(file);
    } else if (
      pathLower.includes('route') ||
      pathLower.includes('api') ||
      pathLower.includes('controller') ||
      pathLower.includes('endpoint') ||
      pathLower.includes('handler') ||
      pathLower.includes('server') ||
      pathLower.includes('app.') ||
      pathLower.includes('main.')
    ) {
      apiFiles.push(file);
    } else if (
      pathLower.includes('model') ||
      pathLower.includes('ml') ||
      pathLower.includes('predict') ||
      pathLower.includes('inference') ||
      pathLower.includes('train') ||
      pathLower.includes('neural') ||
      pathLower.includes('transformer')
    ) {
      modelFiles.push(file);
    } else if (
      pathLower.includes('readme') ||
      pathLower.includes('.git') ||
      pathLower.includes('license') ||
      pathLower.includes('changelog') ||
      pathLower.includes('.lock') ||
      pathLower.includes('node_modules')
    ) {
      continue;
    } else {
      coreFiles.push(file);
    }
  }

  const summary = files.map(f => `${f.path} (${f.language}, ${f.content.length} chars)`).join('\n');

  return { coreFiles, configFiles, apiFiles, modelFiles, summary };
}

// ============================================================
// AI Analysis Pipeline
// ============================================================

/**
 * Phase 1: Project Structure Analysis
 * Uses AI to understand the project type, frameworks, and architecture.
 */
async function analyzeProjectStructure(
  configFiles: CodeFile[],
  fileSummary: string,
  readmeContent: string,
): Promise<Pick<CodeAnalysisResult, 'projectType' | 'primaryLanguage' | 'frameworks' | 'description'>> {
  const configContent = configFiles.map(f => `--- ${f.path} ---\n${f.content.substring(0, 3000)}`).join('\n\n');

  const messages: AIMessage[] = [
    {
      role: 'system',
      content: `You are an expert software architect analyzing open-source projects for integration into a SaaS platform.
You must produce precise, structured analysis. Always respond in valid JSON format.
Analyze the project structure, detect the primary language, frameworks, and provide a clear description.`,
    },
    {
      role: 'user',
      content: `Analyze this project structure and configuration:

## File Structure
${fileSummary.substring(0, 5000)}

## README (first 3000 chars)
${readmeContent.substring(0, 3000)}

## Configuration Files
${configContent.substring(0, 6000)}

Respond ONLY with valid JSON:
{
  "projectType": "node_api" | "python_ml" | "python_api" | "go_api" | "fullstack" | "library" | "cli" | "unknown",
  "primaryLanguage": "string",
  "frameworks": ["string"],
  "description": "Clear 2-3 sentence description of what this project does and its main capabilities"
}`,
    },
  ];

  try {
    const result = await chatCompletion(messages, 'analysis');
    const content = result.content.trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(content);
  } catch (error) {
    log.warn('AI project structure analysis failed, using fallback', { error: error instanceof Error ? error.message : String(error) });
    return {
      projectType: 'unknown',
      primaryLanguage: 'unknown',
      frameworks: [],
      description: 'Project analysis unavailable — AI analysis failed',
    };
  }
}

/**
 * Phase 2: API Detection
 * Uses AI to deeply analyze source code and extract all API endpoints.
 */
async function analyzeAPIs(
  apiFiles: CodeFile[],
  coreFiles: CodeFile[],
): Promise<DetectedAPI[]> {
  if (apiFiles.length === 0 && coreFiles.length === 0) return [];

  const codeContent = [...apiFiles, ...coreFiles.slice(0, 10)]
    .map(f => `--- ${f.path} ---\n${f.content.substring(0, 4000)}`)
    .join('\n\n');

  const messages: AIMessage[] = [
    {
      role: 'system',
      content: `You are an expert at analyzing source code to extract API endpoints, SDK functions, and integration interfaces.
Extract every callable function, HTTP endpoint, WebSocket handler, gRPC service, or public SDK method.
Be thorough and precise. For each API, describe inputs, outputs, authentication, and rate limits.
Always respond in valid JSON.`,
    },
    {
      role: 'user',
      content: `Analyze this source code and extract ALL APIs, endpoints, and callable functions:

${codeContent.substring(0, 12000)}

Respond ONLY with valid JSON array:
[
  {
    "name": "functionName",
    "method": "GET|POST|PUT|DELETE|PATCH|WS|GRPC",
    "path": "/api/endpoint/path",
    "description": "What this API does",
    "inputParams": [
      { "name": "param", "type": "string|number|boolean|object|array|file", "required": true, "defaultValue": null, "description": "What this param does" }
    ],
    "outputFields": [
      { "name": "field", "type": "string", "description": "What this field contains" }
    ],
    "authRequired": false,
    "authType": "none|api_key|bearer|basic|oauth",
    "rateLimitHint": "e.g., 100/min or null"
  }
]

If no APIs are found, return an empty array [].`,
    },
  ];

  try {
    const result = await chatCompletion(messages, 'analysis');
    const content = result.content.trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    log.warn('AI API detection failed', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * Phase 3: ML/AI Model Detection
 * Detects machine learning models, their types, and I/O formats.
 */
async function analyzeModels(
  modelFiles: CodeFile[],
  coreFiles: CodeFile[],
): Promise<DetectedModel[]> {
  const relevantFiles = [...modelFiles, ...coreFiles.filter(f =>
    f.content.toLowerCase().includes('model') ||
    f.content.toLowerCase().includes('predict') ||
    f.content.toLowerCase().includes('inference') ||
    f.content.toLowerCase().includes('neural') ||
    f.content.toLowerCase().includes('transformer') ||
    f.content.toLowerCase().includes('torch') ||
    f.content.toLowerCase().includes('tensorflow'),
  )];

  if (relevantFiles.length === 0) return [];

  const codeContent = relevantFiles
    .map(f => `--- ${f.path} ---\n${f.content.substring(0, 3000)}`)
    .join('\n\n');

  const messages: AIMessage[] = [
    {
      role: 'system',
      content: `You are an AI/ML model expert. Analyze source code to detect ML models, their types, input/output formats, and how they can be called.
Always respond in valid JSON.`,
    },
    {
      role: 'user',
      content: `Analyze this code and detect ALL AI/ML models:

${codeContent.substring(0, 10000)}

Respond ONLY with valid JSON array:
[
  {
    "name": "modelName",
    "type": "llm|asr|tts|image_gen|video_gen|embedding|classification|other",
    "description": "What this model does",
    "inputFormat": "e.g., audio/wav, text, image/png",
    "outputFormat": "e.g., text/json, image/png, video/mp4",
    "endpoint": "http://... or null"
  }
]

If no models are found, return [].`,
    },
  ];

  try {
    const result = await chatCompletion(messages, 'analysis');
    const content = result.content.trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    log.warn('AI model detection failed', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * Phase 4: Configuration & Environment Requirements
 */
async function analyzeConfigRequirements(
  configFiles: CodeFile[],
  allFiles: CodeFile[],
): Promise<CodeAnalysisResult['configRequirements']> {
  const configContent = configFiles.map(f => `--- ${f.path} ---\n${f.content.substring(0, 2000)}`).join('\n\n');

  const envVarPattern = /(?:process\.env\.|os\.environ\.get\(|os\.getenv\(|ENV\[|getenv\()['"]?([A-Z_][A-Z0-9_]*)/g;
  const foundEnvVars = new Set<string>();
  for (const file of allFiles) {
    let match;
    while ((match = envVarPattern.exec(file.content)) !== null) {
      foundEnvVars.add(match[1]);
    }
  }

  const envExamplePattern = /^([A-Z_][A-Z0-9_]*)=(.*)$/gm;
  for (const file of configFiles) {
    if (file.path.includes('.env')) {
      let match;
      while ((match = envExamplePattern.exec(file.content)) !== null) {
        foundEnvVars.add(match[1]);
      }
    }
  }

  if (foundEnvVars.size === 0 && configFiles.length === 0) return [];

  const messages: AIMessage[] = [
    {
      role: 'system',
      content: `You are a DevOps expert analyzing project configuration requirements.
Determine what environment variables and configuration the project needs.
Always respond in valid JSON.`,
    },
    {
      role: 'user',
      content: `Analyze these configuration files and environment variables:

## Configuration Files
${configContent.substring(0, 6000)}

## Detected Environment Variable Names
${Array.from(foundEnvVars).join(', ') || 'None detected'}

Respond ONLY with valid JSON array:
[
  {
    "key": "ENV_VAR_NAME",
    "type": "string|number|boolean|url",
    "required": true,
    "defaultValue": null,
    "isSecret": false,
    "description": "What this config does"
  }
]`,
    },
  ];

  try {
    const result = await chatCompletion(messages, 'fast');
    const content = result.content.trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    log.warn('AI config analysis failed, using regex fallback', { error: error instanceof Error ? error.message : String(error) });
    return Array.from(foundEnvVars).map(key => ({
      key,
      type: 'string' as const,
      required: !key.includes('OPTIONAL') && !key.includes('DEFAULT'),
      isSecret: key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN') || key.includes('PASSWORD'),
      description: `Configuration for ${key}`,
    }));
  }
}

/**
 * Phase 5: Integration Points & Fallback Suggestions
 * The most critical phase — determines HOW to integrate this project into Genova.
 */
async function analyzeIntegrationPoints(
  apis: DetectedAPI[],
  models: DetectedModel[],
  projectType: string,
  description: string,
): Promise<{
  integrationPoints: CodeAnalysisResult['integrationPoints'];
  fallbackSuggestions: CodeAnalysisResult['fallbackSuggestions'];
  healthCheckStrategy: CodeAnalysisResult['healthCheckStrategy'];
}> {
  if (apis.length === 0 && models.length === 0) {
    return {
      integrationPoints: [],
      fallbackSuggestions: [],
      healthCheckStrategy: {},
    };
  }

  const messages: AIMessage[] = [
    {
      role: 'system',
      content: `You are a senior integration architect for a SaaS platform called Genova.
Your job is to determine the best integration strategy for an open-source project.
Consider: adapter pattern, fallback chains, health checks, and error resilience.
The Genova platform uses a multi-provider fallback system (primary → fallback1 → fallback2).
Always respond in valid JSON.`,
    },
    {
      role: 'user',
      content: `Analyze this project and determine integration strategy:

## Project Type
${projectType}

## Description
${description}

## Detected APIs
${JSON.stringify(apis, null, 2).substring(0, 6000)}

## Detected Models
${JSON.stringify(models, null, 2).substring(0, 4000)}

Respond ONLY with valid JSON:
{
  "integrationPoints": [
    {
      "type": "api_endpoint|sdk_function|event_hook|callback|middleware",
      "name": "integrationPointName",
      "description": "How this should be integrated",
      "suggestedAdapter": "adapter class name (e.g., SpeechBrainAdapter, ComfyUIAdapter)",
      "complexity": "simple|moderate|complex"
    }
  ],
  "fallbackSuggestions": [
    {
      "for": "functionName",
      "fallbacks": ["fallback1", "fallback2"],
      "reason": "Why these fallbacks make sense"
    }
  ],
  "healthCheckStrategy": {
    "endpoint": "/health or null",
    "method": "GET",
    "expectedStatus": 200,
    "expectedBody": "ok or null",
    "customLogic": "Custom health check description or null"
  }
}`,
    },
  ];

  try {
    const result = await chatCompletion(messages, 'reasoning');
    const content = result.content.trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(content);
  } catch (error) {
    log.warn('AI integration point analysis failed', { error: error instanceof Error ? error.message : String(error) });
    return {
      integrationPoints: apis.map(api => ({
        type: 'api_endpoint' as const,
        name: api.name,
        description: api.description,
        suggestedAdapter: 'GenericAPIAdapter',
        complexity: 'moderate' as const,
      })),
      fallbackSuggestions: [],
      healthCheckStrategy: apis.some(a => a.path === '/health')
        ? { endpoint: '/health', method: 'GET', expectedStatus: 200 }
        : {},
    };
  }
}

/**
 * Phase 6: Dependency Analysis
 */
async function analyzeDependencies(
  configFiles: CodeFile[],
  allFiles: CodeFile[],
): Promise<DependencyGraph> {
  const internal: DependencyGraph['internal'] = [];
  const external: string[] = [];
  const missing: string[] = [];

  for (const file of allFiles) {
    if (file.language === 'typescript' || file.language === 'javascript') {
      const importPattern = /import\s+.*?\s+from\s+['"](@?[^'"]+)['"]/g;
      const requirePattern = /require\(['"](@?[^'"]+)['"]\)/g;
      let match;

      while ((match = importPattern.exec(file.content)) !== null) {
        const dep = match[1];
        if (dep.startsWith('.') || dep.startsWith('/')) {
          internal.push({ from: file.path, to: dep, type: 'import' });
        } else if (!external.includes(dep)) {
          external.push(dep);
        }
      }

      while ((match = requirePattern.exec(file.content)) !== null) {
        const dep = match[1];
        if (!dep.startsWith('.') && !dep.startsWith('/') && !external.includes(dep)) {
          external.push(dep);
        }
      }
    } else if (file.language === 'python') {
      const pythonImportPattern = /^(?:from|import)\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gm;
      let match;
      const stdlib = new Set(['os', 'sys', 'json', 'time', 'datetime', 'collections', 'typing', 'pathlib', 'io', 'math', 're', 'logging', 'abc', 'dataclasses', 'functools', 'itertools', 'copy', 'hashlib', 'base64', 'struct', 'socket', 'http', 'urllib', 'email', 'html', 'xml', 'csv', 'sqlite3']);
      while ((match = pythonImportPattern.exec(file.content)) !== null) {
        const dep = match[1].split('.')[0];
        if (!external.includes(dep) && !stdlib.has(dep)) {
          external.push(dep);
        }
      }
    }
  }

  const packageJsonFile = configFiles.find(f => f.path.includes('package.json'));
  if (packageJsonFile) {
    try {
      const pkg = JSON.parse(packageJsonFile.content);
      const declared = new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ]);
      for (const ext of external) {
        const baseName = ext.split('/')[0].replace(/^@/, '');
        if (!declared.has(ext) && !declared.has(baseName) && !ext.startsWith('@types/')) {
          missing.push(ext);
        }
      }
    } catch {
      // Can't parse — skip
    }
  }

  const requirementsFile = configFiles.find(f => f.path.includes('requirements'));
  if (requirementsFile) {
    const declared = new Set(
      requirementsFile.content
        .split('\n')
        .map(l => l.trim().split(/[=<>]/)[0].trim().toLowerCase())
        .filter(l => l && !l.startsWith('#')),
    );
    for (const ext of external) {
      if (!declared.has(ext.toLowerCase()) && !declared.has(ext)) {
        missing.push(ext);
      }
    }
  }

  return { internal, external, missing: [...new Set(missing)] };
}

/**
 * Phase 7: Code Pattern Detection
 */
async function analyzeCodePatterns(
  allFiles: CodeFile[],
): Promise<CodeAnalysisResult['codePatterns']> {
  const patterns: CodeAnalysisResult['codePatterns'] = [];

  const patternChecks = [
    { regex: /retry|backoff|exponential/i, pattern: 'Retry Pattern', description: 'Uses retry with backoff for resilience', significance: 'important' as const },
    { regex: /fallback|failover|backup/i, pattern: 'Fallback Pattern', description: 'Implements fallback/failover mechanism', significance: 'critical' as const },
    { regex: /cache|memoiz|ttl/i, pattern: 'Caching Pattern', description: 'Implements caching for performance', significance: 'important' as const },
    { regex: /queue|worker|bull|celery|amqp/i, pattern: 'Queue Pattern', description: 'Uses job queue for async processing', significance: 'important' as const },
    { regex: /stream|sse|websocket|ws:/i, pattern: 'Streaming Pattern', description: 'Supports real-time streaming', significance: 'critical' as const },
    { regex: /webhook|callback|event.*emit|on\(/i, pattern: 'Event Pattern', description: 'Uses events/webhooks for async communication', significance: 'important' as const },
    { regex: /auth|token|jwt|oauth|apikey/i, pattern: 'Auth Pattern', description: 'Implements authentication/authorization', significance: 'critical' as const },
    { regex: /rate.?limit|throttl|quota/i, pattern: 'Rate Limiting', description: 'Implements rate limiting', significance: 'important' as const },
    { regex: /health.?check|readiness|liveness/i, pattern: 'Health Check Pattern', description: 'Implements health check endpoints', significance: 'important' as const },
    { regex: /middleware|interceptor|filter/i, pattern: 'Middleware Pattern', description: 'Uses middleware/interceptor pattern', significance: 'minor' as const },
    { regex: /docker|container|kubernetes|k8s/i, pattern: 'Container Pattern', description: 'Supports containerized deployment', significance: 'minor' as const },
  ];

  for (const check of patternChecks) {
    const locations: string[] = [];
    for (const file of allFiles) {
      if (check.regex.test(file.content)) {
        locations.push(file.path);
      }
    }
    if (locations.length > 0) {
      patterns.push({
        pattern: check.pattern,
        description: check.description,
        locations,
        significance: check.significance,
      });
    }
  }

  return patterns;
}

// ============================================================
// Main Analyzer
// ============================================================

export interface CodeAnalysisOptions {
  files: CodeFile[];
  projectName: string;
  repository?: string;
  readmeContent?: string;
}

/**
 * Run the full AI-powered code analysis pipeline.
 * This is the main entry point for the AI Code Analyzer.
 */
export async function analyzeCode(options: CodeAnalysisOptions): Promise<CodeAnalysisResult> {
  const { files, projectName, repository, readmeContent } = options;
  const startTime = Date.now();

  log.info('Starting AI code analysis', { project: projectName, fileCount: files.length });

  const processedFiles = files.map(f => ({
    ...f,
    language: f.language !== 'unknown' ? f.language : detectLanguage(f.path),
  }));

  const { coreFiles, configFiles, apiFiles, modelFiles, summary } = preprocessFiles(processedFiles);

  const readme = readmeContent ||
    processedFiles.find(f => f.path.toLowerCase().includes('readme'))?.content ||
    '';

  const [
    structureResult,
    apis,
    models,
    dependencies,
    codePatterns,
  ] = await Promise.all([
    analyzeProjectStructure(configFiles, summary, readme),
    analyzeAPIs(apiFiles, coreFiles),
    analyzeModels(modelFiles, coreFiles),
    analyzeDependencies(configFiles, processedFiles),
    analyzeCodePatterns(processedFiles),
  ]);

  const configRequirements = await analyzeConfigRequirements(configFiles, processedFiles);

  const { integrationPoints, fallbackSuggestions, healthCheckStrategy } = await analyzeIntegrationPoints(
    apis,
    models,
    structureResult.projectType,
    structureResult.description,
  );

  let readinessScore = 30;
  if (apis.length > 0) readinessScore += 20;
  if (models.length > 0) readinessScore += 15;
  if (integrationPoints.length > 0) readinessScore += 15;
  if (healthCheckStrategy.endpoint) readinessScore += 10;
  if (configRequirements.length > 0) readinessScore += 5;
  if (dependencies.missing.length === 0) readinessScore += 5;
  if (codePatterns.some(p => p.pattern === 'Fallback Pattern')) readinessScore += 5;
  if (codePatterns.some(p => p.pattern === 'Health Check Pattern')) readinessScore += 5;
  readinessScore = Math.min(100, readinessScore);

  const totalFunctions = apis.length + models.length;
  const analysisConfidence = totalFunctions > 0
    ? Math.min(1, 0.5 + (totalFunctions * 0.1) + (integrationPoints.length * 0.05))
    : 0.3;

  const result: CodeAnalysisResult = {
    ...structureResult,
    apis,
    events: [],
    models,
    dependencies,
    configRequirements,
    integrationPoints,
    codePatterns,
    fallbackSuggestions,
    healthCheckStrategy,
    readinessScore,
    analysisConfidence,
  };

  log.info('AI code analysis complete', {
    project: projectName,
    apis: apis.length,
    models: models.length,
    integrationPoints: integrationPoints.length,
    readiness: readinessScore,
    confidence: analysisConfidence,
    durationMs: Date.now() - startTime,
  });

  return result;
}
