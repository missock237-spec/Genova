/**
 * @module improvement-lab/benchmarker
 * @description Module de benchmarking pour le laboratoire d'amélioration.
 * Exécute des cas de test contre une configuration et mesure
 * la performance selon la métrique cible.
 */

/**
 * Résultat d'un benchmark.
 * Contient le score agrégé et les détails par cas de test.
 * @interface BenchmarkResult
 */
export interface BenchmarkResult {
  /** Score global entre 0 et 1 */
  score: number;
  /** Détails du benchmark par cas de test */
  details: Record<string, unknown>;
}

/**
 * Résultat individuel d'un cas de test.
 * @interface TestCaseResult
 * @internal
 */
interface TestCaseResult {
  /** Score du cas de test */
  score: number;
  /** Durée d'exécution en ms */
  durationMs: number;
  /** Indique si le résultat correspond à la sortie attendue */
  matched?: boolean;
  /** Erreur éventuelle */
  error?: string;
}

/**
 * Exécute un ensemble de cas de test contre une configuration.
 * Pour le moment, cette implémentation est simplifiée :
 * elle mesure la latence et la complétude du résultat.
 * Dans une version complète, elle invoquerait le routeur de modèle
 * avec chaque cas de test et comparerait la sortie à la valeur attendue.
 *
 * @param config - Configuration à tester (peut contenir prompt, model, params).
 * @param testCases - Cas de test avec entrée et sortie attendue optionnelle.
 * @param metric - Nom de la métrique à mesurer (ex: 'accuracy', 'latency_ms').
 * @returns Score agrégé et détails du benchmark.
 *
 * @example
 * ```typescript
 * const résultat = await benchmark(
 *   { prompt: 'Résume en 3 phrases : {input}' },
 *   [
 *     { input: { text: 'Un long texte...' }, expectedOutput: { summary: '...' } },
 *   ],
 *   'accuracy'
 * );
 * console.log(résultat.score); // 0.85
 * ```
 */
export async function benchmark(
  config: Record<string, unknown>,
  testCases: Array<{
    input: Record<string, unknown>;
    expectedOutput?: Record<string, unknown>;
  }>,
  metric: string,
): Promise<BenchmarkResult> {
  const results: TestCaseResult[] = [];
  let totalScore = 0;
  const details: Record<string, unknown> = {
    metric,
    configKeys: Object.keys(config),
    totalTestCases: testCases.length,
    caseResults: [],
  };

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const startTime = performance.now();

    try {
      // Simulation d'exécution : en production, cela appellerait le routeur de modèle
      // avec la config et l'entrée du cas de test
      const simulatedOutput = await simulateExecution(config, testCase.input);
      const durationMs = Math.round(performance.now() - startTime);

      let score = 0;
      let matched = false;

      if (testCase.expectedOutput) {
        // Comparaison basique avec la sortie attendue
        const comparison = compareOutputs(simulatedOutput, testCase.expectedOutput);
        score = comparison.score;
        matched = comparison.matched;
      } else {
        // Sans sortie attendue, scorer sur la complétude
        score = scoreByCompleteness(simulatedOutput);
      }

      // Ajustement selon la métrique cible
      if (metric === 'latency_ms') {
        // Pour la latence, un score élevé signifie une faible latence
        // Score = 1 si < 100ms, 0.5 si < 500ms, 0.2 si < 2000ms, 0 sinon
        if (durationMs < 100) score = 1.0;
        else if (durationMs < 500) score = 0.7;
        else if (durationMs < 2000) score = 0.3;
        else score = 0.1;
      }

      totalScore += score;
      results.push({ score, durationMs, matched });

      (details.caseResults as Array<Record<string, unknown>>).push({
        caseIndex: i,
        score,
        durationMs,
        matched,
      });
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      results.push({
        score: 0,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });

      (details.caseResults as Array<Record<string, unknown>>).push({
        caseIndex: i,
        score: 0,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const avgScore =
    testCases.length > 0 ? totalScore / testCases.length : 0;
  const avgDuration =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length
      : 0;

  details.avgScore = Math.round(avgScore * 1000) / 1000;
  details.avgDurationMs = Math.round(avgDuration);
  details.successRate =
    results.length > 0
      ? results.filter((r) => r.score > 0).length / results.length
      : 0;

  return {
    score: Math.round(avgScore * 1000) / 1000,
    details,
  };
}

/**
 * Simule l'exécution d'une configuration avec une entrée.
 * En production, ceci invoquerait le routeur de modèle.
 * Retourne une sortie synthétique pour les tests.
 *
 * @param config - Configuration à utiliser.
 * @param input - Entrée du cas de test.
 * @returns Sortie simulée.
 * @internal
 */
async function simulateExecution(
  config: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Simuler un délai de traitement
  const simulatedDelay =
    typeof config.simulatedDelayMs === 'number'
      ? (config.simulatedDelayMs as number)
      : 50 + Math.random() * 100;
  await new Promise((resolve) => setTimeout(resolve, simulatedDelay));

  // Retourner une sortie synthétique basée sur la config et l'entrée
  const output: Record<string, unknown> = {
    processed: true,
    inputReceived: Object.keys(input).length > 0,
    configApplied: Object.keys(config).length > 0,
    content: `Résultat généré pour l'entrée avec ${Object.keys(input).length} champ(s).`,
    timestamp: new Date().toISOString(),
  };

  // Si la config contient un modèle, le refléter dans la sortie
  if (config.model) {
    output.model = config.model;
  }

  // Si l'entrée contient un texte, générer un pseudo-résumé
  if (typeof input.text === 'string' && (input.text as string).length > 0) {
    const text = input.text as string;
    output.summary = text.length > 100
      ? text.substring(0, 100) + '...'
      : text;
    output.wordCount = text.split(/\s+/).length;
  }

  return output;
}

/**
 * Compare une sortie produite avec une sortie attendue.
 * Utilise une comparaison basique par clés communes.
 *
 * @param actual - Sortie produite.
 * @param expected - Sortie attendue.
 * @returns Score de correspondance et indicateur de correspondance.
 * @internal
 */
function compareOutputs(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): { score: number; matched: boolean } {
  const expectedKeys = Object.keys(expected);
  if (expectedKeys.length === 0) {
    return { score: 1, matched: true };
  }

  let matches = 0;
  for (const key of expectedKeys) {
 const expectedVal = expected[key];
    const actualVal = actual[key];

    if (actualVal === undefined) continue;

    if (typeof expectedVal === 'string' && typeof actualVal === 'string') {
      // Comparaison de chaînes : similarité basique
      const similarity = stringSimilarity(expectedVal, actualVal);
      if (similarity > 0.7) matches++;
    } else if (JSON.stringify(expectedVal) === JSON.stringify(actualVal)) {
      // Comparaison exacte pour les autres types
      matches++;
    } else if (
      typeof expectedVal === 'number' &&
      typeof actualVal === 'number'
    ) {
      // Tolérance de 10% pour les nombres
      const tolerance = Math.abs(expectedVal) * 0.1;
      if (Math.abs(expectedVal - actualVal) <= tolerance) {
        matches++;
      }
    }
  }

  const score = expectedKeys.length > 0 ? matches / expectedKeys.length : 0;
  return { score, matched: score >= 0.9 };
}

/**
 * Calcule la similarité entre deux chaînes (coefficient de Jaccard sur les mots).
 *
 * @param a - Première chaîne.
 * @param b - Seconde chaîne.
 * @returns Similarité entre 0 et 1.
 * @internal
 */
function stringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 1));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 1));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Score basé sur la complétude de la sortie.
 * Plus la sortie contient de champs et de contenu, plus le score est élevé.
 *
 * @param output - Sortie à évaluer.
 * @returns Score entre 0 et 1.
 * @internal
 */
function scoreByCompleteness(output: Record<string, unknown>): number {
  if (!output || typeof output !== 'object') return 0;

  const keys = Object.keys(output);
  if (keys.length === 0) return 0;

  let score = 0;

  // Points pour le nombre de champs (max 0.4)
  score += Math.min(keys.length * 0.1, 0.4);

  // Points pour les champs non-vides (max 0.3)
  const nonEmptyFields = keys.filter((k) => {
    const val = output[k];
    if (val === null || val === undefined) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.keys(val).length > 0;
    return true;
  });
  score += (nonEmptyFields.length / keys.length) * 0.3;

  // Points pour les champs textuels significatifs (max 0.3)
  const textFields = keys.filter((k) => {
    const val = output[k];
    return typeof val === 'string' && (val as string).trim().length > 10;
  });
  score += Math.min(textFields.length * 0.15, 0.3);

  return Math.min(score, 1);
}
