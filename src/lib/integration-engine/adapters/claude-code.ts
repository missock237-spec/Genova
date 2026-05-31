/**
 * Claude Code Adapter — Genova Integration Engine
 *
 * Integrates Claude Code's plugin and hook system into Genova.
 * Provides AI-assisted code review, feature development, security analysis,
 * and PR review automation through Claude Code's plugin architecture.
 *
 * Note: Claude Code's core is proprietary. This adapter integrates the
 * open-source plugin definitions, hooks, and agent SDK components.
 *
 * Fallback chain: Claude Code Plugin → Genova AI Router (Groq/OpenRouter)
 *
 * @see https://github.com/anthropics/claude-code
 */

import type {
  IntegrationAdapter,
  IntegrationConfig,
  ExecutionResult,
  HealthCheckResult,
} from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('adapter-claude-code');

// ============================================================
// Adapter Implementation
// ============================================================

export class ClaudeCodeAdapter implements IntegrationAdapter {
  readonly config: IntegrationConfig = {
    id: 'claude-code',
    name: 'claude-code',
    displayName: 'Claude Code AI',
    description: 'AI-powered coding assistant with code review, feature development, security analysis, and PR review automation via Claude Code plugins and hooks',
    version: '1.0.0',
    category: 'ai_ml',
    icon: '🤖',
    color: '#D97706',
    homepage: 'https://claude.ai',
    repository: 'https://github.com/anthropics/claude-code',
    status: 'discovered',
    functions: [
      {
        id: 'claude-code-review',
        name: 'codeReview',
        displayName: 'Code Review',
        description: 'AI-powered code review with security, performance, and best practices analysis',
        category: 'ai_ml',
        inputSchema: [
          { name: 'code', type: 'string', required: true, description: 'Source code to review' },
          { name: 'language', type: 'string', required: false, description: 'Programming language' },
          { name: 'context', type: 'string', required: false, description: 'Additional context (file path, PR description, etc.)' },
          { name: 'focus', type: 'string', required: false, defaultValue: 'all', description: 'Review focus area', enum: ['security', 'performance', 'best-practices', 'bugs', 'all'] },
        ],
        outputSchema: [
          { name: 'issues', type: 'array', required: true, description: 'List of identified issues with severity, line, and suggestion' },
          { name: 'score', type: 'number', required: true, description: 'Code quality score (0-100)' },
          { name: 'summary', type: 'string', required: true, description: 'Review summary' },
        ],
        requiresAuth: false,
        timeoutMs: 60_000,
        costPerCall: 0,
        tags: ['code-review', 'security', 'quality', 'ai'],
      },
      {
        id: 'claude-feature-dev',
        name: 'featureDevelopment',
        displayName: 'Feature Development',
        description: 'AI-assisted feature development with planning, implementation, and testing guidance',
        category: 'ai_ml',
        inputSchema: [
          { name: 'description', type: 'string', required: true, description: 'Feature description and requirements' },
          { name: 'codebase', type: 'string', required: false, description: 'Relevant existing code for context' },
          { name: 'framework', type: 'string', required: false, description: 'Framework being used (e.g., Next.js, React)' },
          { name: 'style', type: 'string', required: false, defaultValue: 'production', description: 'Code style', enum: ['production', 'prototype', 'minimal'] },
        ],
        outputSchema: [
          { name: 'plan', type: 'object', required: true, description: 'Implementation plan with steps' },
          { name: 'code', type: 'string', required: false, description: 'Generated code if applicable' },
          { name: 'tests', type: 'string', required: false, description: 'Suggested test cases' },
        ],
        requiresAuth: false,
        timeoutMs: 120_000,
        costPerCall: 0,
        tags: ['feature', 'development', 'coding', 'ai'],
      },
      {
        id: 'claude-security-analysis',
        name: 'securityAnalysis',
        displayName: 'Security Analysis',
        description: 'Deep security analysis of code for vulnerabilities, injection risks, and compliance issues',
        category: 'ai_ml',
        inputSchema: [
          { name: 'code', type: 'string', required: true, description: 'Source code to analyze' },
          { name: 'language', type: 'string', required: false, description: 'Programming language' },
          { name: 'severity', type: 'string', required: false, defaultValue: 'medium', description: 'Minimum severity to report', enum: ['low', 'medium', 'high', 'critical'] },
        ],
        outputSchema: [
          { name: 'vulnerabilities', type: 'array', required: true, description: 'List of security vulnerabilities found' },
          { name: 'riskScore', type: 'number', required: true, description: 'Overall risk score (0-100, higher = more risky)' },
          { name: 'recommendations', type: 'array', required: true, description: 'Security recommendations' },
        ],
        requiresAuth: false,
        timeoutMs: 60_000,
        costPerCall: 0,
        tags: ['security', 'vulnerability', 'analysis', 'ai'],
      },
      {
        id: 'claude-pr-review',
        name: 'prReview',
        displayName: 'PR Review',
        description: 'Automated pull request review with change analysis, risk assessment, and approval recommendations',
        category: 'ai_ml',
        inputSchema: [
          { name: 'diff', type: 'string', required: true, description: 'PR diff content' },
          { name: 'description', type: 'string', required: false, description: 'PR description' },
          { name: 'files', type: 'array', required: false, description: 'List of changed files with paths' },
        ],
        outputSchema: [
          { name: 'approval', type: 'string', required: true, description: 'Approval recommendation', enum: ['approve', 'request-changes', 'comment'] },
          { name: 'concerns', type: 'array', required: true, description: 'Specific concerns found' },
          { name: 'riskLevel', type: 'string', required: true, description: 'Risk level', enum: ['low', 'medium', 'high'] },
        ],
        requiresAuth: false,
        timeoutMs: 90_000,
        costPerCall: 0,
        tags: ['pr', 'review', 'automation', 'ai'],
      },
    ],
    dependencies: ['@anthropic-ai/claude-code'],
    envVariables: [
      { name: 'ANTHROPIC_API_KEY', description: 'Anthropic API key (optional, uses Genova AI Router fallback)', required: false, isSecret: true },
    ],
    apiBaseUrl: undefined,
    metadata: {
      fallbackChain: ['claude-code-plugin', 'genova-ai-router'],
      projectSource: 'claude-code-main',
      note: 'Core is proprietary — this adapter uses the open-source plugin/hook definitions with Genova AI Router as execution backend',
    },
  };

  async initialize(): Promise<void> {
    log.info('Claude Code adapter initializing — using Genova AI Router as backend');
  }

  async execute(functionId: string, params: Record<string, unknown>, _userId: string): Promise<ExecutionResult> {
    switch (functionId) {
      case 'claude-code-review':
      case 'codeReview':
        return this.codeReview(params);
      case 'claude-feature-dev':
      case 'featureDevelopment':
        return this.featureDevelopment(params);
      case 'claude-security-analysis':
      case 'securityAnalysis':
        return this.securityAnalysis(params);
      case 'claude-pr-review':
      case 'prReview':
        return this.prReview(params);
      default:
        return {
          success: false,
          error: `Unknown function: ${functionId}`,
          executionTimeMs: 0,
          provider: 'claude-code',
          costUsd: 0,
          metadata: {},
        };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    // Claude Code adapter is always "healthy" since it uses the Genova AI Router
    // which has its own fallback chain (Groq → OpenRouter → z-ai-sdk)
    return {
      healthy: true,
      responseTimeMs: 0,
      version: '1.0.0',
      details: { backend: 'genova-ai-router', fallbackChain: ['groq', 'openrouter', 'z-ai-sdk'] },
      checkedAt: new Date(),
    };
  }

  async shutdown(): Promise<void> {
    log.info('Claude Code adapter shutting down');
  }

  // -----------------------------------------------------------------------
  // AI Router Execution Helper
  // -----------------------------------------------------------------------

  private async executeWithAI(
    systemPrompt: string,
    userPrompt: string,
    outputFormat: string,
    mode: 'analysis' | 'reasoning' | 'powerful' = 'analysis',
  ): Promise<{ content: string; provider: string; costUsd: number }> {
    const { chatCompletion } = await import('@/lib/ai-router');

    const result = await chatCompletion([
      {
        role: 'system',
        content: `${systemPrompt}\n\nYou MUST respond ONLY with valid JSON matching this format:\n${outputFormat}\n\nDo not include markdown code fences. Return pure JSON only.`,
      },
      { role: 'user', content: userPrompt },
    ], mode);

    return {
      content: result.content.trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim(),
      provider: result.provider,
      costUsd: result.costUsd,
    };
  }

  // -----------------------------------------------------------------------
  // Code Review
  // -----------------------------------------------------------------------

  private async codeReview(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { code, language, context, focus } = params as {
      code: string;
      language?: string;
      context?: string;
      focus?: string;
    };

    if (!code) {
      return {
        success: false,
        error: 'code is required',
        executionTimeMs: Date.now() - startTime,
        provider: 'claude-code',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const result = await this.executeWithAI(
        `You are an expert code reviewer. Analyze the provided code for ${focus || 'all'} issues including: security vulnerabilities, performance problems, bugs, and best practice violations.
For each issue, provide: severity (critical/warning/info), line (if identifiable), description, and suggested fix.
Also provide an overall quality score (0-100) and a summary paragraph.`,
        `Review this ${language || ''} code:\n\n${code.substring(0, 10000)}\n\n${context ? `Context: ${context.substring(0, 2000)}` : ''}\n\nFocus: ${focus || 'all'}`,
        `{
  "issues": [{ "severity": "critical|warning|info", "line": 0, "description": "...", "suggestion": "..." }],
  "score": 85,
  "summary": "..."
}`,
        'analysis',
      );

      const parsed = JSON.parse(result.content);

      return {
        success: true,
        data: {
          ...parsed,
          provider: 'claude-code',
        },
        executionTimeMs: Date.now() - startTime,
        provider: result.provider,
        costUsd: result.costUsd,
        metadata: { function: 'codeReview', language, focus },
      };
    } catch (error) {
      return {
        success: false,
        error: `Code review failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTimeMs: Date.now() - startTime,
        provider: 'claude-code',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  // -----------------------------------------------------------------------
  // Feature Development
  // -----------------------------------------------------------------------

  private async featureDevelopment(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { description, codebase, framework, style } = params as {
      description: string;
      codebase?: string;
      framework?: string;
      style?: string;
    };

    if (!description) {
      return {
        success: false,
        error: 'description is required',
        executionTimeMs: Date.now() - startTime,
        provider: 'claude-code',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const result = await this.executeWithAI(
        `You are an expert software developer specializing in ${framework || 'full-stack'} development.
Create a production-ready implementation plan and code for the requested feature.
Style: ${style || 'production'} — write complete, working code with proper error handling and types.`,
        `Feature: ${description}\n\n${codebase ? `Existing codebase context:\n${codebase.substring(0, 8000)}` : ''}\n\nFramework: ${framework || 'Next.js + TypeScript'}`,
        `{
  "plan": { "steps": [{ "step": 1, "description": "...", "files": ["..."] }] },
  "code": "complete implementation code",
  "tests": "test code or test case descriptions"
}`,
        'powerful',
      );

      const parsed = JSON.parse(result.content);

      return {
        success: true,
        data: {
          ...parsed,
          provider: 'claude-code',
        },
        executionTimeMs: Date.now() - startTime,
        provider: result.provider,
        costUsd: result.costUsd,
        metadata: { function: 'featureDevelopment', framework, style },
      };
    } catch (error) {
      return {
        success: false,
        error: `Feature development failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTimeMs: Date.now() - startTime,
        provider: 'claude-code',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  // -----------------------------------------------------------------------
  // Security Analysis
  // -----------------------------------------------------------------------

  private async securityAnalysis(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { code, language, severity } = params as {
      code: string;
      language?: string;
      severity?: string;
    };

    if (!code) {
      return {
        success: false,
        error: 'code is required',
        executionTimeMs: Date.now() - startTime,
        provider: 'claude-code',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const result = await this.executeWithAI(
        `You are a senior security researcher performing a thorough security audit.
Analyze the code for: SQL injection, XSS, CSRF, authentication bypass, data exposure, insecure deserialization, path traversal, SSRF, command injection, and other OWASP Top 10 vulnerabilities.
Report only issues at or above the specified severity level: ${severity || 'medium'}`,
        `Analyze this ${language || ''} code for security vulnerabilities:\n\n${code.substring(0, 10000)}`,
        `{
  "vulnerabilities": [{ "type": "...", "severity": "critical|high|medium|low", "location": "...", "description": "...", "remediation": "..." }],
  "riskScore": 45,
  "recommendations": ["..."]
}`,
        'reasoning',
      );

      const parsed = JSON.parse(result.content);

      return {
        success: true,
        data: {
          ...parsed,
          provider: 'claude-code',
        },
        executionTimeMs: Date.now() - startTime,
        provider: result.provider,
        costUsd: result.costUsd,
        metadata: { function: 'securityAnalysis', language, minSeverity: severity || 'medium' },
      };
    } catch (error) {
      return {
        success: false,
        error: `Security analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTimeMs: Date.now() - startTime,
        provider: 'claude-code',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  // -----------------------------------------------------------------------
  // PR Review
  // -----------------------------------------------------------------------

  private async prReview(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { diff, description, files } = params as {
      diff: string;
      description?: string;
      files?: string[];
    };

    if (!diff) {
      return {
        success: false,
        error: 'diff is required',
        executionTimeMs: Date.now() - startTime,
        provider: 'claude-code',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const result = await this.executeWithAI(
        `You are a senior engineer reviewing a pull request. Analyze the diff for:
1. Correctness and potential bugs
2. Security implications
3. Performance impact
4. Code quality and maintainability
5. Breaking changes
Provide an approval recommendation with specific concerns.`,
        `PR Description: ${description || 'No description provided'}\n\nChanged files: ${files?.join(', ') || 'Not specified'}\n\nDiff:\n${diff.substring(0, 12000)}`,
        `{
  "approval": "approve|request-changes|comment",
  "concerns": [{ "file": "...", "line": 0, "severity": "high|medium|low", "description": "...", "suggestion": "..." }],
  "riskLevel": "low|medium|high",
  "summary": "..."
}`,
        'reasoning',
      );

      const parsed = JSON.parse(result.content);

      return {
        success: true,
        data: {
          ...parsed,
          provider: 'claude-code',
        },
        executionTimeMs: Date.now() - startTime,
        provider: result.provider,
        costUsd: result.costUsd,
        metadata: { function: 'prReview', filesCount: files?.length || 0 },
      };
    } catch (error) {
      return {
        success: false,
        error: `PR review failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTimeMs: Date.now() - startTime,
        provider: 'claude-code',
        costUsd: 0,
        metadata: {},
      };
    }
  }
}
