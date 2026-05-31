/**
 * Project Scanner — Genova Integration Engine
 *
 * Analyzes open-source project directories to extract capabilities,
 * API endpoints, functions, and configuration requirements.
 * Supports Node.js, Python, and Go projects.
 */

import { createLogger } from '@/lib/logger';
import type {
  ScanResult,
  IntegrationCategory,
  IntegrationFunction,
  EnvVariable,
  ScanIssue,
  FunctionParameter,
} from './types';

const log = createLogger('integration-scanner');

// ============================================================
// Category Detection
// ============================================================

const CATEGORY_KEYWORDS: Record<IntegrationCategory, string[]> = {
  ai_ml: [
    'machine learning', 'deep learning', 'neural network', 'nlp', 'speech',
    'recognition', 'model', 'inference', 'training', 'pytorch', 'tensorflow',
    'transformer', 'asr', 'tts', 'whisper', 'speechbrain', 'cogvideo',
    'videocrafter', 'diffusion', 'generation',
  ],
  communication: [
    'whatsapp', 'telegram', 'slack', 'discord', 'messenger', 'chat',
    'baileys', 'socket', 'real-time', 'messaging', 'voip',
  ],
  automation: [
    'workflow', 'automation', 'trigger', 'pipeline', 'n8n', 'zapier',
    'cron', 'schedule', 'integration', 'orchestration',
  ],
  database: [
    'database', 'storage', 'pocketbase', 'supabase', 'firebase',
    'orm', 'query', 'crud', 'migration', 'schema',
  ],
  media: [
    'image', 'video', 'audio', 'comfyui', 'stable diffusion',
    'generation', 'rendering', 'processing', 'ffmpeg', 'pillow',
  ],
  infrastructure: [
    'server', 'proxy', 'gateway', 'load balancer', 'docker',
    'kubernetes', 'devops', 'monitoring',
  ],
  analytics: [
    'analytics', 'metrics', 'dashboard', 'reporting', 'visualization',
    'statistics', 'tracking',
  ],
  other: [],
};

function detectCategory(keywords: string[], readmeContent: string, packageData: Record<string, unknown>): IntegrationCategory {
  const combined = [
    ...keywords,
    readmeContent.toLowerCase(),
    JSON.stringify(packageData).toLowerCase(),
  ].join(' ');

  let bestCategory: IntegrationCategory = 'other';
  let bestScore = 0;

  for (const [category, categoryKeywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'other') continue;
    const score = categoryKeywords.reduce((acc, kw) => {
      return acc + (combined.includes(kw.toLowerCase()) ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as IntegrationCategory;
    }
  }

  return bestCategory;
}

// ============================================================
// Function Extraction
// ============================================================

function extractNodeFunctions(packageData: Record<string, unknown>, readmeContent: string): IntegrationFunction[] {
  const functions: IntegrationFunction[] = [];
  const name = (packageData.name as string) || 'unknown';

  // Common Node.js project patterns
  if (readmeContent.toLowerCase().includes('api') || readmeContent.toLowerCase().includes('endpoint')) {
    functions.push({
      id: `${name}-api-call`,
      name: 'apiCall',
      displayName: 'API Call',
      description: `Make API calls to ${name} service`,
      category: 'other',
      inputSchema: [
        { name: 'endpoint', type: 'string', required: true, description: 'API endpoint path' },
        { name: 'method', type: 'string', required: false, defaultValue: 'GET', description: 'HTTP method', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
        { name: 'body', type: 'object', required: false, description: 'Request body' },
        { name: 'headers', type: 'object', required: false, description: 'Custom headers' },
      ],
      outputSchema: [
        { name: 'data', type: 'object', required: true, description: 'Response data' },
        { name: 'status', type: 'number', required: true, description: 'HTTP status code' },
      ],
      requiresAuth: true,
      authType: 'api_key',
      timeoutMs: 30_000,
      costPerCall: 0,
      tags: ['api', 'http'],
    });
  }

  if (readmeContent.toLowerCase().includes('send') && readmeContent.toLowerCase().includes('message')) {
    functions.push({
      id: `${name}-send-message`,
      name: 'sendMessage',
      displayName: 'Send Message',
      description: `Send a message via ${name}`,
      category: 'communication',
      inputSchema: [
        { name: 'to', type: 'string', required: true, description: 'Recipient identifier' },
        { name: 'message', type: 'string', required: true, description: 'Message content' },
        { name: 'options', type: 'object', required: false, description: 'Additional options' },
      ],
      outputSchema: [
        { name: 'messageId', type: 'string', required: true, description: 'Sent message ID' },
        { name: 'status', type: 'string', required: true, description: 'Delivery status' },
      ],
      requiresAuth: true,
      authType: 'token',
      timeoutMs: 15_000,
      costPerCall: 0,
      tags: ['messaging', 'communication'],
    });
  }

  if (readmeContent.toLowerCase().includes('workflow') || readmeContent.toLowerCase().includes('automation')) {
    functions.push({
      id: `${name}-execute-workflow`,
      name: 'executeWorkflow',
      displayName: 'Execute Workflow',
      description: `Execute a workflow in ${name}`,
      category: 'automation',
      inputSchema: [
        { name: 'workflowId', type: 'string', required: true, description: 'Workflow ID to execute' },
        { name: 'parameters', type: 'object', required: false, description: 'Workflow input parameters' },
        { name: 'waitForResult', type: 'boolean', required: false, defaultValue: true, description: 'Wait for completion' },
      ],
      outputSchema: [
        { name: 'executionId', type: 'string', required: true, description: 'Execution ID' },
        { name: 'result', type: 'object', required: false, description: 'Execution result' },
        { name: 'status', type: 'string', required: true, description: 'Execution status' },
      ],
      requiresAuth: true,
      authType: 'api_key',
      timeoutMs: 60_000,
      costPerCall: 0,
      tags: ['workflow', 'automation'],
    });
  }

  return functions;
}

function extractPythonFunctions(readmeContent: string, setupData: Record<string, unknown>): IntegrationFunction[] {
  const functions: IntegrationFunction[] = [];
  const name = (setupData.name as string) || 'unknown';

  if (readmeContent.toLowerCase().includes('speech') || readmeContent.toLowerCase().includes('asr') || readmeContent.toLowerCase().includes('transcri')) {
    functions.push({
      id: `${name}-transcribe`,
      name: 'transcribe',
      displayName: 'Speech-to-Text',
      description: `Transcribe audio using ${name}`,
      category: 'ai_ml',
      inputSchema: [
        { name: 'audio', type: 'file', required: true, description: 'Audio file (WAV, MP3, FLAC)' },
        { name: 'language', type: 'string', required: false, defaultValue: 'en', description: 'Language code' },
        { name: 'model', type: 'string', required: false, description: 'Model name to use' },
      ],
      outputSchema: [
        { name: 'text', type: 'string', required: true, description: 'Transcribed text' },
        { name: 'confidence', type: 'number', required: false, description: 'Confidence score (0-1)' },
        { name: 'segments', type: 'array', required: false, description: 'Word-level timestamps' },
      ],
      requiresAuth: false,
      timeoutMs: 120_000,
      costPerCall: 0,
      tags: ['speech', 'asr', 'transcription', 'ai'],
    });
  }

  if (readmeContent.toLowerCase().includes('video') || readmeContent.toLowerCase().includes('generation')) {
    functions.push({
      id: `${name}-generate-video`,
      name: 'generateVideo',
      displayName: 'Generate Video',
      description: `Generate video using ${name}`,
      category: 'ai_ml',
      inputSchema: [
        { name: 'prompt', type: 'string', required: true, description: 'Text prompt for video generation' },
        { name: 'duration', type: 'number', required: false, defaultValue: 4, description: 'Duration in seconds' },
        { name: 'resolution', type: 'string', required: false, defaultValue: '512x512', description: 'Video resolution' },
        { name: 'seed', type: 'number', required: false, description: 'Random seed for reproducibility' },
      ],
      outputSchema: [
        { name: 'videoUrl', type: 'string', required: true, description: 'URL to generated video' },
        { name: 'duration', type: 'number', required: true, description: 'Actual video duration' },
        { name: 'metadata', type: 'object', required: false, description: 'Generation metadata' },
      ],
      requiresAuth: false,
      timeoutMs: 300_000,
      costPerCall: 0,
      tags: ['video', 'generation', 'ai'],
    });
  }

  if (readmeContent.toLowerCase().includes('image') && (readmeContent.toLowerCase().includes('diffusion') || readmeContent.toLowerCase().includes('generate'))) {
    functions.push({
      id: `${name}-generate-image`,
      name: 'generateImage',
      displayName: 'Generate Image',
      description: `Generate images using ${name}`,
      category: 'media',
      inputSchema: [
        { name: 'prompt', type: 'string', required: true, description: 'Text prompt for image generation' },
        { name: 'negativePrompt', type: 'string', required: false, description: 'Negative prompt' },
        { name: 'width', type: 'number', required: false, defaultValue: 512, description: 'Image width' },
        { name: 'height', type: 'number', required: false, defaultValue: 512, description: 'Image height' },
        { name: 'steps', type: 'number', required: false, defaultValue: 20, description: 'Sampling steps' },
        { name: 'seed', type: 'number', required: false, description: 'Random seed' },
      ],
      outputSchema: [
        { name: 'imageUrl', type: 'string', required: true, description: 'URL or base64 of generated image' },
        { name: 'metadata', type: 'object', required: false, description: 'Generation metadata' },
      ],
      requiresAuth: false,
      timeoutMs: 120_000,
      costPerCall: 0,
      tags: ['image', 'diffusion', 'generation'],
    });
  }

  return functions;
}

// ============================================================
// Environment Variable Detection
// ============================================================

function extractEnvVars(readmeContent: string, envExampleContent: string | null): EnvVariable[] {
  const envVars: EnvVariable[] = [];
  const seen = new Set<string>();

  // Parse .env.example content
  if (envExampleContent) {
    const lines = envExampleContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) {
        const name = match[1];
        const defaultVal = match[2]?.replace(/^["']|["']$/g, '') || undefined;
        if (!seen.has(name)) {
          seen.add(name);
          envVars.push({
            name,
            description: `Configuration for ${name}`,
            required: !defaultVal,
            defaultValue: defaultVal || undefined,
            isSecret: name.includes('KEY') || name.includes('SECRET') || name.includes('TOKEN') || name.includes('PASSWORD'),
          });
        }
      }
    }
  }

  // Also extract from README
  const envPatterns = [
    /`([A-Z_][A-Z0-9_]*)`/g,
    /\$([A-Z_][A-Z0-9_]*)/g,
    /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  ];

  for (const pattern of envPatterns) {
    let match;
    while ((match = pattern.exec(readmeContent)) !== null) {
      const name = match[1];
      if (!seen.has(name) && name.length > 2) {
        seen.add(name);
        envVars.push({
          name,
          description: `Environment variable ${name}`,
          required: name.includes('KEY') || name.includes('SECRET') || name.includes('URL'),
          isSecret: name.includes('KEY') || name.includes('SECRET') || name.includes('TOKEN') || name.includes('PASSWORD'),
        });
      }
    }
  }

  return envVars;
}

// ============================================================
// Main Scanner
// ============================================================

export interface ScanOptions {
  projectPath?: string;
  projectName?: string;
  readmeContent?: string;
  packageJson?: Record<string, unknown>;
  requirementsTxt?: string;
  setupPy?: Record<string, unknown>;
  envExample?: string;
  keywords?: string[];
  repository?: string;
  homepage?: string;
}

export async function scanProject(options: ScanOptions): Promise<ScanResult> {
  log.info('Scanning project', { name: options.projectName });

  const readmeContent = options.readmeContent || '';
  const packageData = options.packageJson || {};
  const setupData = options.setupPy || {};
  const keywords = options.keywords || [];
  const projectName = options.projectName || (packageData.name as string) || (setupData.name as string) || 'unknown';
  const description = (packageData.description as string) || (setupData.description as string) || '';
  const version = (packageData.version as string) || (setupData.version as string) || '0.0.0';

  // Detect category
  const detectedCategory = detectCategory(keywords, readmeContent, packageData);

  // Extract functions based on project type
  let detectedFunctions: IntegrationFunction[] = [];
  const isPython = !!options.requirementsTxt || !!options.setupPy;
  const isNode = !!options.packageJson;

  if (isNode) {
    detectedFunctions = extractNodeFunctions(packageData, readmeContent);
  }
  if (isPython) {
    detectedFunctions = [...detectedFunctions, ...extractPythonFunctions(readmeContent, setupData)];
  }
  if (!isNode && !isPython && readmeContent) {
    // Generic — try both
    detectedFunctions = [
      ...extractNodeFunctions({ name: projectName }, readmeContent),
      ...extractPythonFunctions(readmeContent, { name: projectName }),
    ];
  }

  // Extract environment variables
  const detectedEnvVars = extractEnvVars(readmeContent, options.envExample || null);

  // Detect dependencies
  const dependencies: string[] = [];
  if (packageData.dependencies) {
    dependencies.push(...Object.keys(packageData.dependencies as Record<string, string>));
  }
  if (packageData.devDependencies) {
    dependencies.push(...Object.keys(packageData.devDependencies as Record<string, string>));
  }
  if (options.requirementsTxt) {
    dependencies.push(
      ...options.requirementsTxt
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
        .map(l => l.split(/[=<>]/)[0].trim()),
    );
  }

  // Assess readiness
  const issues: ScanIssue[] = [];
  let readinessScore = 50; // Start at 50

  // Positive factors
  if (detectedFunctions.length > 0) readinessScore += 15;
  if (detectedEnvVars.length > 0) readinessScore += 5;
  if (description) readinessScore += 5;
  if (version && version !== '0.0.0') readinessScore += 5;
  if (options.repository) readinessScore += 5;
  if (readmeContent.length > 500) readinessScore += 5;

  // Negative factors
  if (detectedFunctions.length === 0) {
    issues.push({
      severity: 'warning',
      message: 'No specific functions detected. Will use generic API adapter.',
      suggestion: 'Provide more details in the README or specify functions manually.',
    });
    readinessScore -= 10;
  }

  const requiredSecrets = detectedEnvVars.filter(v => v.required && v.isSecret);
  if (requiredSecrets.length > 0) {
    issues.push({
      severity: 'info',
      message: `${requiredSecrets.length} required secret(s) need to be configured: ${requiredSecrets.map(s => s.name).join(', ')}`,
      suggestion: 'Configure these in the .env file before activating the integration.',
    });
  }

  readinessScore = Math.max(0, Math.min(100, readinessScore));

  log.info('Scan completed', {
    name: projectName,
    category: detectedCategory,
    functions: detectedFunctions.length,
    readiness: readinessScore,
  });

  return {
    projectName,
    description,
    version,
    repository: options.repository,
    homepage: options.homepage,
    detectedCategory,
    detectedFunctions,
    detectedEnvVars,
    dependencies,
    readinessScore,
    issues,
    metadata: {
      scannedAt: new Date().toISOString(),
      projectType: isPython ? 'python' : isNode ? 'node' : 'unknown',
    },
  };
}
