/**
 * GENOVA AI OS — Auth Validation Schemas
 * Zod schemas used both client-side and server-side.
 * Single source of truth for all auth validation rules.
 */

import { z } from 'zod';

// ─── PASSWORD POLICY ─────────────────────────────────────────────────────────

export const PASSWORD_MIN_LENGTH = 8;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Minimum ${PASSWORD_MIN_LENGTH} caractères requis`)
  .max(128, 'Maximum 128 caractères')
  .refine((v) => /[A-Z]/.test(v), {
    message: 'Au moins 1 lettre majuscule requise',
  })
  .refine((v) => /[a-z]/.test(v), {
    message: 'Au moins 1 lettre minuscule requise',
  })
  .refine((v) => /[0-9]/.test(v), {
    message: 'Au moins 1 chiffre requis',
  })
  .refine((v) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(v), {
    message: 'Au moins 1 caractère spécial requis (!@#$...)',
  });

// ─── REGISTER SCHEMA ─────────────────────────────────────────────────────────

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Minimum 2 caractères')
      .max(50, 'Maximum 50 caractères')
      .regex(/^[a-zA-ZÀ-ÿ\s'\-]+$/, 'Caractères invalides dans le nom'),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, 'Email requis')
      .email('Adresse email invalide')
      .max(255, 'Email trop long'),

    password: passwordSchema,

    confirmPassword: z.string().min(1, 'Confirmation requise'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

// ─── LOGIN SCHEMA ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email requis')
    .email('Adresse email invalide'),

  password: z.string().min(1, 'Mot de passe requis'),

  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── FORGOT PASSWORD SCHEMA ───────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email requis')
    .email('Adresse email invalide'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// ─── RESET PASSWORD SCHEMA ────────────────────────────────────────────────────

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Token requis').max(512),

    password: passwordSchema,

    confirmPassword: z.string().min(1, 'Confirmation requise'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ─── HELPER: format Zod errors → flat field map ──────────────────────────────

export function formatZodErrors(
  error: z.ZodError
): Record<string, string> {
  return error.issues.reduce<Record<string, string>>((acc, err) => {
    const key = err.path.join('.');
    if (!acc[key]) acc[key] = err.message;
    return acc;
  }, {});
}
