import { z } from 'zod';

/**
 * Gen3ia — Accès typé aux variables d'environnement (compat)
 *
 * NOTE : le projet est migré de PostgreSQL/Prisma vers Cloud Firestore.
 * `DATABASE_URL` n'est plus requis ; il est conservé comme champ optionnel
 * pour la rétrocompatibilité des consommateurs existants. Le schéma canonique
 * complet reste dans `src/lib/env-validation.ts` (validateEnv/getEnv).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // Optionnel : conservé pour rétrocompatibilité (migration Firestore).
  DATABASE_URL: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  REDIS_URL: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  HUGGINGFACE_API_KEY: z.string().optional(),

  EMAIL_FROM: z.string().email().default('noreply@genova.ai'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.warn('Variables d\'environnement invalides:');
    for (const issue of result.error.issues) {
      console.warn(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Variables d\'environnement invalides');
    }
    _env = {
      NODE_ENV: 'development',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      LOG_LEVEL: 'debug',
      DATABASE_URL: process.env.DATABASE_URL,
      AUTH_SECRET: process.env.AUTH_SECRET || 'dev-secret-key-32-characters-minimum!!',
    } as Env;
    return _env;
  }
  _env = result.data;
  return _env;
}

export const env = getEnv();
