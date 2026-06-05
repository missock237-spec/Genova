/**
 * AI Security Engine — Comprehensive security layer for AI interactions
 *
 * Enforces token limits, cost limits, dangerous prompt blocking,
 * file upload validation, and per-action rate limiting.
 * All checks can be combined via `checkAll()` for a single gate.
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { PromptValidator } from './prompt-validator';
import { FileValidator } from './file-validator';
import { createAuditLog } from '@/lib/auth';

const log = createLogger('ai-security');

// ============================================================
// Types
// ============================================================

export type AIActionType = 'chat' | 'image' | 'video' | 'code';

export interface TokenLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

export interface CostLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

export interface PromptBlockResult {
  safe: boolean;
  threatLevel: string;
  blocked: boolean;
  reason?: string;
  sanitized: string;
}

export interface FileValidationResult {
  allowed: boolean;
  reason?: string;
}

export interface AIRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export interface AISecurityRequest {
  prompt?: string;
  estimatedTokens?: number;
  estimatedCostUsd?: number;
  actionType: AIActionType;
  file?: {
    name: string;
    size: number;
    type: string;
  };
}

export interface AISecurityCheckResult {
  allowed: boolean;
  tokenLimit?: TokenLimitResult;
  costLimit?: CostLimitResult;
  promptBlock?: PromptBlockResult;
  fileValidation?: FileValidationResult;
  rateLimit?: AIRateLimitResult;
  reasons: string[];
}

// ============================================================
// Plan Limits
// ============================================================

interface PlanSecurityLimits {
  maxTokensPerDay: number;
  maxCostUsdPerDay: number;
}

const PLAN_SECURITY_LIMITS: Record<string, PlanSecurityLimits> = {
  free: {
    maxTokensPerDay: 50_000,
    maxCostUsdPerDay: 0.50,
  },
  pro: {
    maxTokensPerDay: 500_000,
    maxCostUsdPerDay: 5.00,
  },
};

// ============================================================
// Rate Limit Configuration
// ============================================================

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const AI_RATE_LIMITS: Record<AIActionType, RateLimitConfig> = {
  chat:  { maxRequests: 60,  windowMs: 60_000 },        // 60/min
  image: { maxRequests: 10,  windowMs: 3_600_000 },     // 10/hour
  video: { maxRequests: 5,   windowMs: 3_600_000 },     // 5/hour
  code:  { maxRequests: 30,  windowMs: 60_000 },        // 30/min
};

// ============================================================
// In-Memory Rate Limit Store (Redis-ready)
// ============================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000).unref?.();

function getRateLimitKey(userId: string, actionType: AIActionType): string {
  return `ai_rl:${userId}:${actionType}`;
}

function checkInMemoryRateLimit(
  key: string,
  config: RateLimitConfig
): AIRateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return { allowed: true };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      retryAfterMs: entry.resetAt - now,
    };
  }

  entry.count++;
  return { allowed: true };
}

// ============================================================
// User Plan Resolution
// ============================================================

async function getUserPlan(userId: string): Promise<string> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    return user?.plan || 'free';
  } catch {
    return 'free';
  }
}

// ============================================================
// AI Security Engine
// ============================================================

export class AISecurityEngine {
  private promptValidator: PromptValidator;
  private fileValidator: FileValidator;

  constructor() {
    this.promptValidator = new PromptValidator();
    this.fileValidator = new FileValidator();
  }

  // -----------------------------------------------------------------------
  // Token Limit Check
  // -----------------------------------------------------------------------

  /**
   * Check if a user has remaining daily token budget.
   * Token limits: Free=50K/day, Pro=500K/day
   */
  async checkTokenLimit(
    userId: string,
    estimatedTokens: number
  ): Promise<TokenLimitResult> {
    const plan = await getUserPlan(userId);
    const limits = PLAN_SECURITY_LIMITS[plan] || PLAN_SECURITY_LIMITS.free;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    let usedTokens = 0;
    try {
      const result = await db.aICost.aggregate({
        where: {
          userId,
          createdAt: { gte: startOfDay },
        },
        _sum: { totalTokens: true },
      });
      usedTokens = result._sum.totalTokens || 0;
    } catch (error) {
      log.error('Failed to query token usage', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      // On DB failure, deny the request for safety
      return { allowed: false, remaining: 0, limit: limits.maxTokensPerDay };
    }

    const remaining = Math.max(0, limits.maxTokensPerDay - usedTokens);
    const allowed = estimatedTokens <= remaining;

    if (!allowed) {
      log.warn('Token limit exceeded', {
        userId,
        plan,
        usedTokens,
        estimatedTokens,
        limit: limits.maxTokensPerDay,
      });
    }

    return {
      allowed,
      remaining,
      limit: limits.maxTokensPerDay,
    };
  }

  // -----------------------------------------------------------------------
  // Cost Limit Check
  // -----------------------------------------------------------------------

  /**
   * Check if a user has remaining daily cost budget.
   * Cost limits: Free=$0.50/day, Pro=$5.00/day
   */
  async checkCostLimit(
    userId: string,
    estimatedCostUsd: number
  ): Promise<CostLimitResult> {
    const plan = await getUserPlan(userId);
    const limits = PLAN_SECURITY_LIMITS[plan] || PLAN_SECURITY_LIMITS.free;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    let usedCost = 0;
    try {
      const result = await db.aICost.aggregate({
        where: {
          userId,
          createdAt: { gte: startOfDay },
        },
        _sum: { costUsd: true },
      });
      usedCost = result._sum.costUsd || 0;
    } catch (error) {
      log.error('Failed to query cost usage', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return { allowed: false, remaining: 0, limit: limits.maxCostUsdPerDay };
    }

    const remaining = Math.max(0, limits.maxCostUsdPerDay - usedCost);
    const allowed = estimatedCostUsd <= remaining;

    if (!allowed) {
      log.warn('Cost limit exceeded', {
        userId,
        plan,
        usedCost: usedCost.toFixed(4),
        estimatedCostUsd: estimatedCostUsd.toFixed(4),
        limit: limits.maxCostUsdPerDay,
      });
    }

    return {
      allowed,
      remaining: Math.round(remaining * 10000) / 10000, // 4 decimal precision
      limit: limits.maxCostUsdPerDay,
    };
  }

  // -----------------------------------------------------------------------
  // Prompt Validation & Blocking
  // -----------------------------------------------------------------------

  /**
   * Validate a prompt for injection attacks and content policy violations.
   * Returns safe/blocked status with threat level and sanitized version.
   */
  async validateAndBlock(prompt: string): Promise<PromptBlockResult> {
    if (!prompt || prompt.trim().length === 0) {
      return {
        safe: true,
        threatLevel: 'none',
        blocked: false,
        sanitized: '',
      };
    }

    const result = this.promptValidator.validatePrompt(prompt);

    // Block critical and high threat levels
    const blocked = result.threatLevel === 'critical' || result.threatLevel === 'high';

    if (blocked) {
      log.warn('Prompt blocked', {
        threatLevel: result.threatLevel,
        risks: result.risks,
        promptHash: crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16),
      });
    }

    return {
      safe: result.safe,
      threatLevel: result.threatLevel,
      blocked,
      reason: blocked ? result.risks.join('; ') : undefined,
      sanitized: result.sanitizedPrompt,
    };
  }

  // -----------------------------------------------------------------------
  // File Upload Validation
  // -----------------------------------------------------------------------

  /**
   * Validate a file upload for security compliance.
   * Max 50MB, allowed types: image/*, application/pdf, text/*, application/json
   * Dangerous extensions blocked: .exe, .sh, .bat, .cmd, .ps1, .vbs, .js, etc.
   */
  validateFileUpload(
    file: { name: string; size: number; type: string }
  ): FileValidationResult {
    const result = this.fileValidator.validate(file);

    if (!result.allowed) {
      log.warn('File upload rejected', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        reason: result.reason,
      });
    }

    return {
      allowed: result.allowed,
      reason: result.reason,
    };
  }

  // -----------------------------------------------------------------------
  // AI Rate Limiting
  // -----------------------------------------------------------------------

  /**
   * Check rate limit for a specific AI action type.
   * chat=60/min, image=10/hour, video=5/hour, code=30/min
   */
  async checkAIRateLimit(
    userId: string,
    actionType: AIActionType
  ): Promise<AIRateLimitResult> {
    const config = AI_RATE_LIMITS[actionType];
    const key = getRateLimitKey(userId, actionType);

    const result = checkInMemoryRateLimit(key, config);

    if (!result.allowed) {
      log.warn('AI rate limit exceeded', {
        userId,
        actionType,
        retryAfterMs: result.retryAfterMs,
      });
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Combined Security Check
  // -----------------------------------------------------------------------

  /**
   * Run all applicable security checks in a single call.
   * Returns a combined result with detailed breakdown.
   */
  async checkAll(
    userId: string,
    request: AISecurityRequest
  ): Promise<AISecurityCheckResult> {
    const reasons: string[] = [];
    let allowed = true;

    // 1. Rate limit check (fastest, check first)
    const rateLimit = await this.checkAIRateLimit(userId, request.actionType);
    if (!rateLimit.allowed) {
      allowed = false;
      reasons.push(
        `Rate limit exceeded for ${request.actionType}. Retry after ${Math.ceil((rateLimit.retryAfterMs || 0) / 1000)}s.`
      );
    }

    // 2. Token limit check (if estimated tokens provided)
    let tokenLimit: TokenLimitResult | undefined;
    if (request.estimatedTokens && request.estimatedTokens > 0) {
      tokenLimit = await this.checkTokenLimit(userId, request.estimatedTokens);
      if (!tokenLimit.allowed) {
        allowed = false;
        reasons.push(
          `Token limit reached. Remaining: ${tokenLimit.remaining.toLocaleString()}/${tokenLimit.limit.toLocaleString()}`
        );
      }
    }

    // 3. Cost limit check (if estimated cost provided)
    let costLimit: CostLimitResult | undefined;
    if (request.estimatedCostUsd && request.estimatedCostUsd > 0) {
      costLimit = await this.checkCostLimit(userId, request.estimatedCostUsd);
      if (!costLimit.allowed) {
        allowed = false;
        reasons.push(
          `Cost limit reached. Remaining: $${costLimit.remaining.toFixed(4)}/$${costLimit.limit.toFixed(2)}`
        );
      }
    }

    // 4. Prompt validation (if prompt provided)
    let promptBlock: PromptBlockResult | undefined;
    if (request.prompt) {
      promptBlock = await this.validateAndBlock(request.prompt);
      if (promptBlock.blocked) {
        allowed = false;
        reasons.push(
          `Prompt blocked: ${promptBlock.reason || 'Security threat detected'}`
        );
      }
    }

    // 5. File validation (if file provided)
    let fileValidation: FileValidationResult | undefined;
    if (request.file) {
      fileValidation = this.validateFileUpload(request.file);
      if (!fileValidation.allowed) {
        allowed = false;
        reasons.push(
          `File rejected: ${fileValidation.reason || 'Invalid file'}`
        );
      }
    }

    // Audit log for blocked requests
    if (!allowed) {
      try {
        await createAuditLog({
          userId,
          action: 'ai_security_block',
          resource: 'ai_security',
          details: {
            actionType: request.actionType,
            reasons,
            hasPrompt: !!request.prompt,
            hasFile: !!request.file,
            estimatedTokens: request.estimatedTokens,
            estimatedCostUsd: request.estimatedCostUsd,
          },
          severity: 'warning',
        });
      } catch {
        // Audit logging must not block the main flow
      }
    }

    return {
      allowed,
      tokenLimit,
      costLimit,
      promptBlock,
      fileValidation,
      rateLimit,
      reasons,
    };
  }
}

// ============================================================
// Singleton
// ============================================================

let _engine: AISecurityEngine | null = null;

export function getAISecurityEngine(): AISecurityEngine {
  if (!_engine) {
    _engine = new AISecurityEngine();
  }
  return _engine;
}
