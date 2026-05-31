/**
 * Integration Engine Types — Genova SaaS
 *
 * Defines the type system for the Open-Source Integration Server.
 * This engine can scan, analyze, register, and execute functions
 * from any open-source project within the Genova ecosystem.
 */

// ============================================================
// Integration Status
// ============================================================

export type IntegrationStatus =
  | 'discovered'    // Scanned but not yet installed
  | 'installing'    // Currently being set up
  | 'active'        // Running and available
  | 'inactive'      // Installed but deactivated
  | 'error'         // Failed to start or crashed
  | 'updating';     // Being updated to a new version

export type IntegrationCategory =
  | 'ai_ml'         // AI/ML models (SpeechBrain, CogVideo, VideoCrafter)
  | 'communication' // Messaging (Baileys, WhatsApp)
  | 'automation'    // Workflow (n8n)
  | 'database'      // Data storage (PocketBase)
  | 'media'         // Image/Video/Audio (ComfyUI)
  | 'infrastructure' // Server/DevOps tools
  | 'analytics'     // Data analytics
  | 'other';        // Unclassified

// ============================================================
// Core Types
// ============================================================

export interface IntegrationFunction {
  id: string;
  name: string;                    // Function name (e.g., "transcribe")
  displayName: string;             // Human-readable name (e.g., "Speech-to-Text")
  description: string;
  category: IntegrationCategory;
  inputSchema: FunctionParameter[]; // Expected input parameters
  outputSchema: FunctionParameter[]; // Output parameters
  requiresAuth: boolean;
  authType?: 'api_key' | 'oauth' | 'token' | 'basic';
  rateLimit?: { maxCalls: number; windowMs: number };
  timeoutMs: number;
  costPerCall: number;             // USD, 0 for free
  tags: string[];
}

export interface FunctionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' | 'stream';
  required: boolean;
  defaultValue?: unknown;
  description: string;
  enum?: string[];
}

export interface IntegrationConfig {
  id: string;
  name: string;                     // e.g., "speechbrain"
  displayName: string;              // e.g., "SpeechBrain ASR"
  description: string;
  version: string;
  category: IntegrationCategory;
  icon: string;                     // Emoji or icon name
  color: string;                    // Theme color (hex)
  homepage: string;                 // Project URL
  repository: string;               // Git repo URL
  status: IntegrationStatus;
  functions: IntegrationFunction[];
  dependencies: string[];           // Required npm/pip packages
  envVariables: EnvVariable[];
  healthCheckUrl?: string;
  apiBaseUrl?: string;
  installedAt?: Date;
  lastHealthCheck?: Date;
  error?: string;
  metadata: Record<string, unknown>;
}

export interface EnvVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  isSecret: boolean;
}

// ============================================================
// Scan Result Types
// ============================================================

export interface ScanResult {
  projectName: string;
  description: string;
  version: string;
  repository?: string;
  homepage?: string;
  detectedCategory: IntegrationCategory;
  detectedFunctions: IntegrationFunction[];
  detectedEnvVars: EnvVariable[];
  dependencies: string[];
  readinessScore: number;          // 0-100, how ready it is for integration
  issues: ScanIssue[];
  metadata: Record<string, unknown>;
}

export interface ScanIssue {
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion?: string;
}

// ============================================================
// Execution Types
// ============================================================

export interface ExecutionRequest {
  integrationId: string;
  functionId: string;
  params: Record<string, unknown>;
  userId: string;
  timeoutMs?: number;
  priority?: 'low' | 'normal' | 'high';
}

export interface ExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTimeMs: number;
  provider: string;
  model?: string;
  costUsd: number;
  metadata: Record<string, unknown>;
}

export interface HealthCheckResult {
  healthy: boolean;
  responseTimeMs: number;
  version?: string;
  details?: Record<string, unknown>;
  error?: string;
  checkedAt: Date;
}

// ============================================================
// Event Types
// ============================================================

export type IntegrationEventType =
  | 'discovered'
  | 'installed'
  | 'activated'
  | 'deactivated'
  | 'executed'
  | 'error'
  | 'health_check'
  | 'updated';

export interface IntegrationEvent {
  type: IntegrationEventType;
  integrationId: string;
  timestamp: Date;
  details: Record<string, unknown>;
}

// ============================================================
// Adapter Interface
// ============================================================

export interface IntegrationAdapter {
  readonly config: IntegrationConfig;

  initialize(): Promise<void>;
  execute(functionId: string, params: Record<string, unknown>, userId: string): Promise<ExecutionResult>;
  healthCheck(): Promise<HealthCheckResult>;
  shutdown(): Promise<void>;
}
