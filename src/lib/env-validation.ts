// ============================================================
// Phase 1.2 — Centralisation et validation des variables d'environnement
// Gen3ia · src/lib/env-validation.ts
//
// - Schéma Zod complet (EnvSchema)
// - Validation au démarrage (appelée depuis instrumentation.ts)
// - Erreur lisible si une variable CRITIQUE manque (fail-fast, pas d'échec silencieux)
// - Défauts sûrs pour les options optionnelles
//
// NOTE : le projet est migré de PostgreSQL/Prisma vers Cloud Firestore.
// `DATABASE_URL` n'est plus requis (champ optionnel de rétrocompatibilité).
//
// NOTE : l'ancien provider SebPay a été remplacé par Chariow (adaptateur).
// Les variables SEBPAY_* sont OBSOLÈTES et remplacées par CHARIOW_* / CAMPAY_*.
//
// Critère de la phase : « Prévenir les erreurs silencieuses en production. »
// ============================================================
import { z } from 'zod';

// ---------- Helpers ----------
/**
 * Préfixe publique: ces variables sont exposées au navigateur.
 * Tout ce qui n'est PAS préfixé NEXT_PUBLIC_ doit rester côté serveur.
 */
const boolish = z
  .union([z.boolean(), z.string(), z.undefined()])
  .transform((v) =>
    v === undefined ? undefined : v === true || v === 'true' || v === '1',
  );

/** Chaîne requise non vide */
const reqString = z.string().min(1, 'Requis (obligatoire)');

/** Chaîne optionnelle: "" / undefined => undefined */
const optString = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

/** Port TCP optionnel avec défaut */
const port = (def: number) =>
  z.coerce.number().int().min(1).max(65535).default(def);

// ---------- Schéma complet ----------
export const EnvSchema = z.object({
  // ==== CRITIQUES — toujours requises en production ====
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  // Optionnel : conservé pour rétrocompatibilité (migration Firestore).
  DATABASE_URL: optString,
  // AUTH_SECRET critique en production, vérifié dans validateEnv().
  // En dev, un défaut inoffensif évite de bloquer le boot.
  AUTH_SECRET: optString.default('dev-insecure-secret'),
  NEXTAUTH_SECRET: optString,
  NEXTAUTH_URL: optString,
  NEXT_PUBLIC_APP_URL: optString.default('http://localhost:3000'),

  // ==== Cache & Vector DB (servent toutes deux de fallbacks que l'app gère) ====
  REDIS_URL: optString,
  QDRANT_URL: optString,

  // ==== IA / LLM — requises seulement si l'intégration est activée ====
  OPENAI_ENABLED: boolish.default(false),
  OPENAI_API_KEY: optString,
  ANTHROPIC_ENABLED: boolish.default(false),
  ANTHROPIC_API_KEY: optString,
  GROQ_ENABLED: boolish.default(false),
  GROQ_API_KEY: optString,
  HUGGINGFACE_ENABLED: boolish.default(false),
  HUGGINGFACE_TOKEN: optString,

  // ==== Paiements — Chariow (principal, Mobile Money + Carte) ====
  CHARIOW_API_KEY: optString,
  CHARIOW_WEBHOOK_SECRET: optString,
  CHARIOW_API_URL: optString.default('https://api.chariow.com/v1'),
  CHARIOW_PRODUCT_DEFAULT: optString,

  // ==== Paiements — Campay (Mobile Money Cameroun, push USSD) ====
  CAMPAY_USERNAME: optString,
  CAMPAY_PASSWORD: optString,
  CAMPAY_APP_ID: optString,
  CAMPAY_APP_TOKEN: optString,
  CAMPAY_API_URL: optString.default('https://campay.net/api'),
  CAMPAY_WEBHOOK_SECRET: optString,

  // ==== Paiements Stripe (carte bancaire, optionnel) ====
  STRIPE_ENABLED: boolish.default(false),
  STRIPE_SECRET_KEY: optString,
  STRIPE_PUBLISHABLE_KEY: optString,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optString,
  STRIPE_WEBHOOK_SECRET: optString,
  NEXT_PUBLIC_STRIPE_PRICE_ID: optString,

  // ==== Email / SMTP ====
  SMTP_ENABLED: boolish.default(false),
  SMTP_HOST: optString.default('smtp.resend.com'),
  SMTP_PORT: port(587),
  SMTP_USER: optString,
  SMTP_PASS: optString,
  SMTP_SECURE: boolish.default(false),
  EMAIL_FROM: optString.default('noreply@gen3ia.ai'),

  // ==== OAuth ====
  GOOGLE_CLIENT_ID: optString,
  GOOGLE_CLIENT_SECRET: optString,
  GITHUB_CLIENT_ID: optString,
  GITHUB_CLIENT_SECRET: optString,

  // ==== Monitoring / Observabilité ====
  SENTRY_DSN: optString,
  NEXT_PUBLIC_SENTRY_DSN: optString,
  SENTRY_ORG: optString,
  SENTRY_PROJECT: optString,
  LOKI_URL: optString,

  // ==== Rate limiting distribué ====
  UPSTASH_REDIS_REST_URL: optString,
  UPSTASH_REDIS_REST_TOKEN: optString,

  // ==== Chiffrement & sécurité ====
  VAULT_MASTER_KEY: optString,
  ADMIN_EMAILS: optString
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []))
    .default([]),
  SNYK_TOKEN: optString,

  // ==== Application ====
  NEXT_TELEMETRY_DISABLED: boolish.default(true),
  SEED_DATABASE: boolish.default(false),
  JWT_MAX_AGE: z.coerce.number().int().positive().default(3600),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

// ---------- Validation ----------

/**
 * Intégrations optionnelles et la variable qui les « doit » être présente quand activées.
 * Utilisé pour les erreurs conditionnelles (pas de fail sur une clé inutilisée).
 */
const conditionalRequirements: Array<{
  enabled: keyof EnvConfig;
  required: (keyof EnvConfig)[];
  label: string;
}> = [
  { enabled: 'OPENAI_ENABLED', required: ['OPENAI_API_KEY'], label: 'OpenAI' },
  { enabled: 'ANTHROPIC_ENABLED', required: ['ANTHROPIC_API_KEY'], label: 'Anthropic' },
  { enabled: 'GROQ_ENABLED', required: ['GROQ_API_KEY'], label: 'Groq' },
  { enabled: 'HUGGINGFACE_ENABLED', required: ['HUGGINGFACE_TOKEN'], label: 'Hugging Face' },
  {
    enabled: 'STRIPE_ENABLED',
    required: [
      'STRIPE_SECRET_KEY',
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      'STRIPE_WEBHOOK_SECRET',
    ],
    label: 'Stripe',
  },
  {
    enabled: 'SMTP_ENABLED',
    required: ['SMTP_USER', 'SMTP_PASS'],
    label: 'SMTP/Email',
  },
];

/**
 * Valide toutes les variables d'environnement.
 * - En production : jette une erreur lisible (fail-fast) si une variable CRITIQUE manque.
 * - Les intégrations optionnelles ne bloquent que si explicitement activées (X_ENABLED=true)
 *   mais que la/les clé(s) correspondante(s) sont absentes.
 * Renvoie la config typée et validée.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      [
        '❌ [env-validation] Variable(s) d\'environnement invalide(s) :',
        details,
      ].join('\n'),
    );
  }

  const cfg = parsed.data as EnvConfig;

  if (cfg.NODE_ENV === 'production') {
    // AUTH_SECRET critique en prod
    if (!cfg.AUTH_SECRET || cfg.AUTH_SECRET === 'dev-insecure-secret') {
      throw new Error(
        '❌ [env-validation] AUTH_SECRET est REQUIS en production ' +
          '(>= 32 caractères). Fournissez une valeur forte dans votre environnement.',
      );
    }

    // Vérification croisée des intégrations activées
    const missing: string[] = [];
    for (const req of conditionalRequirements) {
      if (!cfg[req.enabled]) continue;
      const missingKeys = req.required.filter(
        (k) => !(cfg as Record<string, unknown>)[k],
      );
      if (missingKeys.length > 0) {
        missing.push(`${req.label}: manque ${missingKeys.join(', ')}`);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        '❌ [env-validation] Intégrations activées mais clés manquantes :\n  - ' +
          missing.join('\n  - '),
      );
    }
  }

  return cfg;
}

// ---------- Cache singleton ----------
let _env: EnvConfig | undefined;

/**
 * Accès sécurisé et typé aux variables validées (cachées après la 1re validation).
 * Utilisez `getEnv()` dans l'application au lieu de `process.env` brut.
 */
export function getEnv(): EnvConfig {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}

/** Vide le cache (utile pour les tests). */
export function resetEnvCache(): void {
  _env = undefined;
}
