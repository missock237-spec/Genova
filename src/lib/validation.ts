// Centralized Zod Validation Schemas for Genova API Routes
// Every input from the client is validated before reaching business logic.
// Prevents: injection, mass assignment, invalid data, XSS

import { z } from 'zod';

// ============================================================
// PRIMITIVE SCHEMAS — Reusable building blocks
// ============================================================

export const cuidSchema = z.string().min(1).max(50).regex(/^c[lmnpqrstuvwxyz0-9]{24,}$/);

export const emailSchema = z.string().email().max(255);

export const passwordSchema = z.string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(128)
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre');

export const nameSchema = z.string().min(1).max(100).trim();

export const descriptionSchema = z.string().min(0).max(2000).trim().default('');

export const jsonSchema = z.string().max(100000).refine(
  (val) => { try { JSON.parse(val); return true; } catch { return false; } },
  { message: 'JSON invalide' }
);

export const safeStringSchema = z.string().max(50000).trim();

// ============================================================
// AUTH SCHEMAS
// ============================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const registerSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
});

// ============================================================
// PASSWORD RESET SCHEMAS
// ============================================================

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z.string().length(6, 'Le code doit contenir 6 chiffres').regex(/^\d{6}$/, 'Code invalide'),
  newPassword: passwordSchema,
});

// ============================================================
// AGENT SCHEMAS
// ============================================================

export const createAgentSchema = z.object({
  name: nameSchema,
  type: z.enum(['assistant', 'analyst', 'developer', 'researcher', 'creative', 'automation', 'custom']),
  description: descriptionSchema,
  config: z.record(z.string(), z.unknown()).optional(),
  avatar: z.string().max(500).optional(),
});

export const updateAgentSchema = z.object({
  name: nameSchema.optional(),
  type: z.enum(['assistant', 'analyst', 'developer', 'researcher', 'creative', 'automation', 'custom']).optional(),
  description: descriptionSchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  avatar: z.string().max(500).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// ============================================================
// TASK SCHEMAS
// ============================================================

export const createTaskSchema = z.object({
  title: nameSchema,
  description: descriptionSchema,
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  agentId: cuidSchema.optional(),
  workflowId: cuidSchema.optional(),
});

export const updateTaskSchema = z.object({
  title: nameSchema.optional(),
  description: descriptionSchema.optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  result: safeStringSchema.optional(),
  agentId: cuidSchema.nullable().optional(),
});

// ============================================================
// WORKFLOW SCHEMAS
// ============================================================

export const createWorkflowSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  steps: z.array(z.record(z.string(), z.unknown())).min(1, 'Au moins une étape requise'),
  trigger: z.object({
    type: z.enum(['manual', 'schedule', 'event', 'webhook']),
    config: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const updateWorkflowSchema = z.object({
  name: nameSchema.optional(),
  description: descriptionSchema.optional(),
  steps: z.array(z.record(z.string(), z.unknown())).min(1).optional(),
  trigger: z.object({
    type: z.enum(['manual', 'schedule', 'event', 'webhook']),
    config: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
});

// ============================================================
// GUARDRAIL SCHEMAS
// ============================================================

export const createGuardrailSchema = z.object({
  name: nameSchema,
  type: z.enum(['content_filter', 'rate_limit', 'token_limit', 'domain_restriction', 'custom']),
  description: descriptionSchema,
  rules: z.record(z.string(), z.unknown()),
  severity: z.enum(['info', 'warning', 'critical']).default('warning'),
});

export const updateGuardrailSchema = z.object({
  name: nameSchema.optional(),
  type: z.enum(['content_filter', 'rate_limit', 'token_limit', 'domain_restriction', 'custom']).optional(),
  description: descriptionSchema.optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================
// CONVERSATION / KNOWLEDGE SCHEMAS
// ============================================================

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(10000).trim(),
  conversationId: cuidSchema.optional(),
});

export const createKnowledgeSchema = z.object({
  content: z.string().min(1).max(50000).trim(),
  category: z.enum(['preference', 'project', 'document', 'workflow_context', 'agent_learning']).default('project'),
  tags: z.array(z.string().max(50)).max(20).default([]),
  source: z.enum(['conversation', 'document', 'manual']).default('manual'),
});

export const deleteKnowledgeSchema = z.object({
  id: cuidSchema,
});

// ============================================================
// AI / RAG SCHEMAS
// ============================================================

export const aiChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(50000).trim(),
  })).min(1).max(50),
});

export const aiValidateSchema = z.object({
  action: z.string().min(1).max(500).trim(),
  content: z.string().max(50000).trim().optional(),
});

export const aiOrchestrateSchema = z.object({
  command: z.string().min(1).max(5000).trim(),
  agentIds: z.array(cuidSchema).min(1).max(10).optional(),
});

export const multiAgentExecuteSchema = z.object({
  objective: z.string().min(1).max(5000).trim(),
  agentIds: z.array(cuidSchema).min(1).max(10),
});

export const ragQuerySchema = z.object({
  query: z.string().min(1).max(10000).trim(),
  topK: z.number().int().min(1).max(50).default(5),
});

export const ragUploadSchema = z.object({
  userId: cuidSchema, // Validated but overridden by auth
});

// ============================================================
// EXECUTE SCHEMAS
// ============================================================

export const executeAgentSchema = z.object({
  task: z.string().min(1).max(10000).trim(),
  context: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================
// HELPER — Validate and return typed data or throw
// ============================================================

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: NextResponse } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: NextResponse.json(
      {
        error: 'Données invalides',
        details: formatZodErrors(result.error),
      },
      { status: 400 }
    ),
  };
}

export function formatZodErrors(error: ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    formatted[path] = issue.message;
  }
  return formatted;
}
