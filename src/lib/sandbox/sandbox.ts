/**
 * @module sandbox/sandbox
 * @description Bac à sable d'exécution de code pour Gen3ia.
 * Fournit un environnement d'exécution isolé pour le code des agents.
 * Compatible Vercel serverless (pas de containers réels).
 */

import type { SandboxConfig, SandboxResult } from './types';

/**
 * Langages de programmation supportés par le bac à sable.
 * @internal
 */
const SUPPORTED_LANGUAGES = ['javascript', 'typescript', 'python'] as const;

/**
 * Type des langages supportés.
 * @internal
 */
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Configuration par défaut du bac à sable.
 * Limite stricte pour un environnement serverless.
 * @constant
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  timeoutMs: 30_000,
  maxMemoryMb: 128,
  maxCpuPercent: 50,
  networkAccess: false,
  allowedPaths: [],
  envVars: {},
};

/**
 * Modèles de code dangereux détectés par l'analyse statique.
 * Chaque pattern est accompagné d'une description en français.
 * @internal
 */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/g, description: 'Accès au module child_process (exécution de commandes système)' },
  { pattern: /require\s*\(\s*['"]fs['"]\s*\)/g, description: 'Accès au système de fichiers via le module fs' },
  { pattern: /import\s+.*\s+from\s+['"]fs['"]/g, description: 'Import du module fs (accès au système de fichiers)' },
  { pattern: /import\s+.*\s+from\s+['"]fs\/promises['"]/g, description: 'Import du module fs/promises (accès asynchrone au système de fichiers)' },
  { pattern: /require\s*\(\s*['"]net['"]\s*\)/g, description: 'Accès au module réseau bas niveau' },
  { pattern: /require\s*\(\s*['"]http['"]\s*\)/g, description: 'Accès au module HTTP (requêtes réseau)' },
  { pattern: /require\s*\(\s*['"]https['"]\s*\)/g, description: 'Accès au module HTTPS (requêtes réseau)' },
  { pattern: /require\s*\(\s*['"]tls['"]\s*\)/g, description: 'Accès au module TLS (connexions sécurisées)' },
  { pattern: /require\s*\(\s*['"]dns['"]\s*\)/g, description: 'Accès au module DNS (requêtes réseau)' },
  { pattern: /require\s*\(\s*['"]os['"]\s*\)/g, description: 'Accès au module OS (informations système)' },
  { pattern: /process\.exit\s*\(/g, description: 'Appel à process.exit (arrêt du processus hôte)' },
  { pattern: /process\.env/g, description: 'Accès aux variables d\'environnement' },
  { pattern: /process\.cwd\s*\(/g, description: 'Accès au répertoire de travail' },
  { pattern: /process\.chdir\s*\(/g, description: 'Modification du répertoire de travail' },
  { pattern: /process\.kill\s*\(/g, description: 'Envoi de signaux à des processus' },
  { pattern: /\beval\s*\(/g, description: 'Utilisation de eval (exécution de code dynamique)' },
  { pattern: /new\s+Function\s*\(/g, description: 'Constructeur Function (exécution de code dynamique)' },
  { pattern: /setTimeout\s*\(\s*['"`]/g, description: 'setTimeout avec chaîne (exécution de code dynamique)' },
  { pattern: /setInterval\s*\(\s*['"`]/g, description: 'setInterval avec chaîne (exécution de code dynamique)' },
  { pattern: /require\s*\(\s*['"]path['"]\s*\)/g, description: 'Accès au module path (informations système)' },
  { pattern: /require\s*\(\s*['"]cluster['"]\s*\)/g, description: 'Accès au module cluster (multiprocessus)' },
  { pattern: /require\s*\(\s*['"]worker_threads['"]\s*\)/g, description: 'Accès aux threads workers' },
  { pattern: /\bfetch\s*\(/g, description: 'Appel à fetch (requête réseau)' },
  { pattern: /XMLHttpRequest/g, description: 'Utilisation de XMLHttpRequest (requête réseau)' },
];

/**
 * Vérifie si un langage est supporté par le bac à sable.
 *
 * @param language - Nom du langage à vérifier.
 * @returns Vrai si le langage est supporté.
 * @internal
 */
function isSupportedLanguage(language: string): language is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(language);
}

/**
 * Mesure la consommation mémoire actuelle en mégaoctets.
 * Utilise `process.memoryUsage` si disponible.
 * @internal
 */
function estimateMemoryMb(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const usage = process.memoryUsage();
    return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
  }
  return 0;
}

/**
 * Exécute du code JavaScript/TypeScript dans un environnement limité.
 * Utilise `new Function()` avec un mécanisme de timeout via Promise.race.
 * ⚠️ Cette méthode ne fournit PAS une isolation réelle. Pour une isolation
 * complète, un conteneur (Docker, gVisor) est nécessaire.
 *
 * @param code - Code source à exécuter.
 * @param config - Configuration du bac à sable.
 * @returns Promesse résolue avec le résultat de l'exécution.
 * @internal
 */
async function executeJavaScript(
  code: string,
  config: SandboxConfig,
): Promise<SandboxResult> {
  const startTime = performance.now();
  const logs: string[] = [];
  let exitCode: number | null = 0;
  let error: string | undefined;

  // Surcharge console pour capturer la sortie
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockConsole: Record<string, (...args: any[]) => void> = {
    log: (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    },
    error: (...args: unknown[]) => {
      logs.push(`[stderr] ${args.map(String).join(' ')}`);
    },
    warn: (...args: unknown[]) => {
      logs.push(`[warn] ${args.map(String).join(' ')}`);
    },
    info: (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    },
    // Méthodes par défaut pour éviter les erreurs
    debug: () => {},
    trace: () => {},
    dir: () => {},
    table: () => {},
    time: () => {},
    timeEnd: () => {},
    group: () => {},
    groupEnd: () => {},
    clear: () => {},
  };

  // Envelopper le code pour capturer la valeur de retour
  const wrappedCode = `
    "use strict";
    const __result = (async function() {
      ${code}
    })();
    return __result;
  `;

  try {
    // Remplacer temporairement console
    (console as unknown as Record<string, unknown>).log = mockConsole.log;
    (console as unknown as Record<string, unknown>).error = mockConsole.error;
    (console as unknown as Record<string, unknown>).warn = mockConsole.warn;

    // Créer la fonction avec un environnement contrôlé
    const fn = new Function(
      'console',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'require',
      wrappedCode,
    );

    // Exécuter avec timeout via Promise.race
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Délai d'exécution dépassé (${config.timeoutMs}ms)`)),
        config.timeoutMs,
      ),
    );

    // Versions neutralisées des fonctions de timer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noop = (..._args: any[]) => {};
    const safeRequire = (mod: string) => {
      throw new Error(`Module non autorisé en bac à sable : ${mod}`);
    };

    const result = await Promise.race([
      fn(mockConsole, noop, noop, noop, noop, safeRequire),
      timeoutPromise,
    ]);

    // Si le code retourne une valeur, l'ajouter aux logs
    if (result !== undefined) {
      logs.push(String(result));
    }
  } catch (err) {
    exitCode = 1;
    if (err instanceof Error) {
      if (err.message.includes('Délai d\'exécution dépassé')) {
        exitCode = null;
        error = err.message;
      } else {
        error = `${err.name}: ${err.message}`;
      }
    } else {
      error = String(err);
    }
  } finally {
    // Restaurer console
    (console as unknown as Record<string, unknown>).log = originalLog;
    (console as unknown as Record<string, unknown>).error = originalError;
    (console as unknown as Record<string, unknown>).warn = originalWarn;
  }

  const durationMs = Math.round(performance.now() - startTime);
  const timedOut = exitCode === null;
  const stdout = logs.filter((l) => !l.startsWith('[stderr]')).join('\n');
  const stderr = logs
    .filter((l) => l.startsWith('[stderr]'))
    .map((l) => l.replace(/^\[stderr\]\s*/, ''))
    .join('\n');

  return {
    success: exitCode === 0,
    stdout,
    stderr,
    exitCode,
    durationMs,
    memoryUsedMb: estimateMemoryMb(),
    timedOut,
    error,
  };
}

/**
 * Exécute du code dans le bac à sable.
 *
 * Pour JavaScript/TypeScript, utilise `new Function()` avec un timeout.
 * Pour Python, retourne un résultat indiquant la nécessité d'un worker dédié.
 *
 * ⚠️ AVERTISSEMENT : L'isolation en environnement serverless (Vercel) est limitée.
 * `new Function()` s'exécute dans le même processus. Pour une isolation complète,
 * utilisez un service de conteneur (E2B, Firecracker, Docker).
 *
 * @param code - Code source à exécuter.
 * @param language - Langage du code ('javascript', 'typescript' ou 'python').
 * @param config - Configuration partielle à fusionner avec les valeurs par défaut.
 * @returns Promesse résolue avec le résultat de l'exécution.
 *
 * @example
 * ```typescript
 * const résultat = await executeInSandbox(
 *   'return 2 + 2;',
 *   'javascript',
 *   { timeoutMs: 5000 }
 * );
 * console.log(résultat.stdout); // '4'
 * ```
 */
export async function executeInSandbox(
  code: string,
  language: string,
  config?: Partial<SandboxConfig>,
): Promise<SandboxResult> {
  // Validation du langage
  if (!isSupportedLanguage(language)) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: 1,
      durationMs: 0,
      memoryUsedMb: 0,
      timedOut: false,
      error: `Langage non supporté : '${language}'. Langages supportés : ${SUPPORTED_LANGUAGES.join(', ')}.`,
    };
  }

  // Fusion de la configuration
  const mergedConfig: SandboxConfig = {
    ...DEFAULT_SANDBOX_CONFIG,
    ...config,
  };

  // Cas Python : pas d'exécution directe dans un environnement serverless
  if (language === 'python') {
    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      durationMs: 0,
      memoryUsedMb: 0,
      timedOut: false,
      error:
        'L\'exécution Python nécessite un worker dédié. En environnement serverless (Vercel), utilisez le connecteur E2B ou un microservice Python externe.',
    };
  }

  // Avertissement d'isolation limitée (une seule fois par processus)
  if (!globalThis.__gen3ia_sandbox_warning_logged) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        event: 'sandbox_limited_isolation',
        message:
          'Le bac à sable utilise new Function() sans isolation réelle. Pour une isolation complète, utilisez E2B ou des conteneurs.',
        service: 'sandbox',
      }),
    );
    globalThis.__gen3ia_sandbox_warning_logged = true;
  }

  // Exécuter le code JavaScript/TypeScript
  return executeJavaScript(code, mergedConfig);
}

/**
 * Analyse statique du code pour détecter les patterns dangereux.
 * Ne modifie pas le code, se contente de le scanner.
 *
 * @param code - Code source à analyser.
 * @param language - Langage du code.
 * @returns Résultat de l'analyse avec la liste des problèmes détectés.
 *
 * @example
 * ```typescript
 * const analyse = await validateCode(
 *   'require("fs").readFileSync("/etc/passwd")',
 *   'javascript'
 * );
 * console.log(analyse.valid); // false
 * console.log(analyse.issues); // ['Accès au système de fichiers via le module fs']
 * ```
 */
export async function validateCode(
  code: string,
  language: string,
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Vérification du langage
  if (!isSupportedLanguage(language)) {
    issues.push(`Langage non supporté : '${language}'`);
    return { valid: false, issues };
  }

  // Pour Python, vérifications spécifiques
  if (language === 'python') {
    const pythonPatterns: Array<{ pattern: RegExp; description: string }> = [
      { pattern: /\bos\.system\s*\(/g, description: 'Appel à os.system (exécution de commandes système)' },
      { pattern: /\bsubprocess\./g, description: 'Utilisation du module subprocess (exécution de commandes)' },
      { pattern: /\bexec\s*\(/g, description: 'Utilisation de exec (exécution de code dynamique)' },
      { pattern: /\beval\s*\(/g, description: 'Utilisation de eval (exécution de code dynamique)' },
      { pattern: /\bopen\s*\(\s*['"]\//g, description: 'Ouverture de fichier avec chemin absolu' },
      { pattern: /import\s+os/g, description: 'Import du module os (accès système)' },
      { pattern: /import\s+subprocess/g, description: 'Import du module subprocess' },
      { pattern: /import\s+shutil/g, description: 'Import du module shutil (opérations fichiers)' },
      { pattern: /import\s+socket/g, description: 'Import du module socket (accès réseau bas niveau)' },
      { pattern: /from\s+os\s+import/g, description: 'Import depuis le module os' },
      { pattern: /from\s+subprocess\s+import/g, description: 'Import depuis le module subprocess' },
      { pattern: /__import__\s*\(/g, description: 'Utilisation de __import__ (import dynamique)' },
      { pattern: /\bgetattr\s*\(\s*__builtins__/g, description: 'Accès aux builtins via getattr' },
    ];

    for (const { pattern, description } of pythonPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(code)) {
        issues.push(description);
      }
    }

    return { valid: issues.length === 0, issues };
  }

  // Pour JavaScript/TypeScript, utiliser les patterns génériques
  for (const { pattern, description } of DANGEROUS_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(code)) {
      issues.push(description);
    }
  }

  // Vérifications supplémentaires TypeScript
  if (language === 'typescript') {
    const tsPatterns: Array<{ pattern: RegExp; description: string }> = [
      { pattern: /declare\s+global\s*\{/g, description: 'Modification de la portée globale (declare global)' },
      { pattern: /\/<reference\s+path=/g, description: 'Référence de chemin potentiellement dangereuse' },
    ];

    for (const { pattern, description } of tsPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(code)) {
        issues.push(description);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Déclaration globale pour le drapeau d'avertissement.
 * @internal
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  var __gen3ia_sandbox_warning_logged: boolean;
}
