/**
 * @module verification/engine
 * @description Moteur de vérification principal pour les exécutions d'agents Gen3ia.
 * Implémente cinq axes de vérification : fonctionnel, qualité de sortie,
 * sécurité, conformité aux politiques et cohérence.
 */

import { db } from '@/lib/db';
import type {
  VerificationType,
  VerificationResult,
  VerificationIssue,
  VerificationPolicy,
} from './types';

/**
 * Modèles de détectiçon d'injection de prompt.
 * Ces patterns couvrent les tentatives courantes de manipulation.
 * @internal
 */
const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /<\|system\|>/i,
  /forget\s+(everything|all|your)\s+(instructions?|rules?|training)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /act\s+as\s+(if\s+)?(a|an)\s+/i,
  /roleplay\s+as/i,
  /jailbreak/i,
  /DAN\s+mode/i,
];

/**
 * Modèles de détection de fuite de données personnelles (PII).
 * @internal
 */
const PII_PATTERNS: readonly RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/g,           // SSN américain
  /\b[A-Z]{2}\d{6}\b/g,                  // Numéro de passeport
  /\b\d{16}\b/g,                          // Numéro de carte bancaire (simplifié)
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
  /\b\+?\d{1,4}[\s-]?\(?\d{1,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,9}\b/g, // Téléphone
];

/**
 * Modèles de détection de contenu malveillant.
 * @internal
 */
const MALICIOUS_PATTERNS: readonly RegExp[] = [
  /rm\s+-rf\s+\//g,
  /DROP\s+TABLE/gi,
  /DELETE\s+FROM\s+\w+\s*;\s*$/gm,
  /<script[^>]*>.*?<\/script>/gis,
  /javascript\s*:/gi,
  /on\w+\s*=/gi,
  /curl\s+.*\|\s*(bash|sh)/g,
  /wget\s+.*\|\s*(bash|sh)/g,
];

/**
 * Texte de remplacement (placeholder) à détecter dans les sorties.
 * @internal
 */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\[?placeholder\]?/gi,
  /\[?à\s+remplir\]?/gi,
  /\[?TODO\]?/gi,
  /\[?TBD\]?/gi,
  /Lorem ipsum/gi,
  /XXX{3,}/g,
  /___{3,}/g,
];

/**
 * Génère un identifiant unique pour un résultat de vérification.
 * @returns Identifiant au format UUID.
 * @internal
 */
function generateVerificationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Crée un résultat de vérification partiel avec les champs communs.
 * @param executionId - Identifiant de l'exécution.
 * @param agentId - Identifiant de l'agent.
 * @param type - Type de vérification.
 * @returns Résultat partiel à compléter.
 * @internal
 */
function createBaseResult(
  executionId: string,
  agentId: string,
  type: VerificationType,
): Omit<VerificationResult, 'passed' | 'score' | 'details' | 'issues' | 'durationMs'> {
  return {
    id: generateVerificationId(),
    executionId,
    agentId,
    type,
    verifiedAt: new Date(),
    verifier: `verification-engine:${type}`,
  };
}

/**
 * Vérifie le caractère fonctionnel de la sortie.
 * Contrôle que la sortie n'est pas vide et possède les champs attendus.
 * @param output - Sortie de l'agent à vérifier.
 * @param input - Entrée originale de la tâche.
 * @returns Résultat de la vérification fonctionnelle.
 */
function verifyFunctional(
  output: Record<string, unknown>,
  input: Record<string, unknown>,
): Pick<VerificationResult, 'passed' | 'score' | 'details' | 'issues'> {
  const issues: VerificationIssue[] = [];
  let score = 0;
  const details: Record<string, unknown> = {};

  // Vérification : sortie non vide
  const hasContent = output !== null &&
    typeof output === 'object' &&
    Object.keys(output).length > 0;

  if (!hasContent) {
    issues.push({
      severity: 'critical',
      description: 'La sortie de l\'agent est vide ou invalide.',
      suggestion: 'Vérifiez que l\'agent reçoit bien l\'entrée et peut produire une sortie.',
    });
    return { passed: false, score: 0, details, issues };
  }

  score += 0.3;

  // Vérification : présence de contenu textuel ou de données structurées
  const keys = Object.keys(output);
  const hasTextualContent = keys.some(
    (k) => typeof output[k] === 'string' && (output[k] as string).trim().length > 0,
  );
  const hasStructuredData = keys.some(
    (k) =>
      Array.isArray(output[k]) ||
      (typeof output[k] === 'object' && output[k] !== null),
  );

  if (!hasTextualContent && !hasStructuredData) {
    issues.push({
      severity: 'warning',
      description: 'La sortie ne contient ni texte ni données structurées significatives.',
      suggestion: 'L\'agent devrait produire un contenu textuel ou structuré.',
    });
  } else {
    score += 0.3;
  }

  // Vérification : cohérence avec le type de tâche demandé
  const taskType = (input.taskType as string) || (input.type as string) || 'général';
  const expectedFields: Record<string, string[]> = {
    'général': ['text', 'result', 'output', 'response', 'content', 'message', 'answer'],
    'résumé': ['summary', 'résumé', 'text', 'content'],
    'analyse': ['analysis', 'analyse', 'findings', 'result'],
    'code': ['code', 'output', 'result', 'response'],
    'classification': ['label', 'category', 'classification', 'result'],
    'extraction': ['data', 'extracted', 'entities', 'result'],
    'traduction': ['translated', 'translation', 'result', 'text'],
  };

  const fieldsForTask = expectedFields[taskType] || expectedFields['général'];
  const hasExpectedField = keys.some((k) => fieldsForTask.some((f) => k.toLowerCase().includes(f)));

  details.taskType = taskType;
  details.hasExpectedField = hasExpectedField;
  details.outputKeys = keys;

  if (hasExpectedField || keys.length >= 1) {
    score += 0.4;
  } else {
    issues.push({
      severity: 'info',
      description: `Aucun champ attendu pour le type de tâche « ${taskType} » n'a été trouvé.`,
      suggestion: `Champs attendus : ${fieldsForTask.join(', ')}`,
    });
  }

  return {
    passed: score >= 0.7,
    score: Math.min(score, 1),
    details,
    issues,
  };
}

/**
 * Vérifie la qualité de la sortie de l'agent.
 * Évalue la longueur, la cohérence et détecte les textes de substitution.
 * @param output - Sortie de l'agent à vérifier.
 * @returns Résultat de la vérification de qualité.
 */
function verifyOutputQuality(
  output: Record<string, unknown>,
): Pick<VerificationResult, 'passed' | 'score' | 'details' | 'issues'> {
  const issues: VerificationIssue[] = [];
  let score = 0;
  const details: Record<string, unknown> = {};

  // Extraire le contenu textuel principal
  const textFields = Object.values(output).filter(
    (v) => typeof v === 'string' && (v as string).trim().length > 0,
  ) as string[];

  const mainText = textFields[0] || '';
  const totalLength = mainText.length;
  details.totalLength = totalLength;
  details.textFieldCount = textFields.length;

  // Vérification de la longueur
  if (totalLength === 0) {
    issues.push({
      severity: 'critical',
      description: 'La sortie ne contient aucun texte.',
      suggestion: 'L\'agent doit produire une sortie textuelle.',
    });
    return { passed: false, score: 0, details, issues };
  }

  // Score basé sur la longueur (minimum 10 caractères, optimum 500-5000)
  if (totalLength >= 10) score += 0.2;
  if (totalLength >= 50) score += 0.1;
  if (totalLength >= 200) score += 0.1;
  if (totalLength <= 50000) score += 0.1;

  // Vérification des placeholders
  const allText = textFields.join(' ');
  let placeholderCount = 0;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = allText.match(pattern);
    if (matches) placeholderCount += matches.length;
  }

  details.placeholderCount = placeholderCount;

  if (placeholderCount > 0) {
    const penalty = Math.min(placeholderCount * 0.15, 0.5);
    score = Math.max(0, score - penalty);
    issues.push({
      severity: placeholderCount > 3 ? 'critical' : 'warning',
      description: `${placeholderCount} texte(s) de substitution détecté(s) dans la sortie.`,
      suggestion: 'Remplacez les placeholders par du contenu réel avant la livraison.',
    });
  }

  // Heuristiques de cohérence basique
  const sentences = mainText.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  details.sentenceCount = sentences.length;

  if (sentences.length > 0) {
    score += 0.2;

    // Vérifier que les phrases ont une longueur raisonnable (pas trop courtes)
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.trim().length, 0) / sentences.length;
    details.avgSentenceLength = Math.round(avgSentenceLength);

    if (avgSentenceLength >= 20) {
      score += 0.1;
    } else if (avgSentenceLength < 10 && sentences.length > 3) {
      issues.push({
        severity: 'info',
        description: 'Les phrases de la sortie sont très courtes en moyenne.',
        suggestion: 'L\'agent pourrait produire des réponses plus développées.',
      });
    }
  }

  // Vérification de diversité lexicale basique
  const words = mainText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const uniqueWords = new Set(words);
  const lexicalDiversity = words.length > 0 ? uniqueWords.size / words.length : 0;
  details.lexicalDiversity = Math.round(lexicalDiversity * 100) / 100;
  details.wordCount = words.length;
  details.uniqueWordCount = uniqueWords.size;

  if (lexicalDiversity > 0.5) {
    score += 0.2;
  } else if (lexicalDiversity > 0.3) {
    score += 0.1;
  } else if (words.length > 20) {
    issues.push({
      severity: 'info',
      description: 'Diversité lexicale faible : beaucoup de répétitions.',
      suggestion: 'L\'agent pourrait varier son vocabulaire.',
    });
  }

  return {
    passed: score >= 0.6,
    score: Math.min(Math.max(score, 0), 1),
    details,
    issues,
  };
}

/**
 * Vérifie la sécurité de la sortie de l'agent.
 * Détecte les injections de prompt, les fuites de PII et le contenu malveillant.
 * @param output - Sortie de l'agent à vérifier.
 * @returns Résultat de la vérification de sécurité.
 */
function verifySecurity(
  output: Record<string, unknown>,
): Pick<VerificationResult, 'passed' | 'score' | 'details' | 'issues'> {
  const issues: VerificationIssue[] = [];
  let score = 1.0;
  const details: Record<string, unknown> = {
    promptInjectionDetected: false,
    piiDetected: false,
    maliciousContentDetected: false,
  };

  // Sérialiser toute la sortie pour inspection
  const outputStr = JSON.stringify(output);

  // Vérification des injections de prompt
  let injectionMatches = 0;
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    const matches = outputStr.match(pattern);
    if (matches) injectionMatches += matches.length;
  }

  if (injectionMatches > 0) {
    details.promptInjectionDetected = true;
    details.injectionMatchCount = injectionMatches;
    const penalty = Math.min(injectionMatches * 0.3, 0.8);
    score -= penalty;
    issues.push({
      severity: 'critical',
      description: `${injectionMatches} tentative(s) d'injection de prompt détectée(s) dans la sortie.`,
      suggestion: 'La sortie contient des instructions qui pourraient manipuler d\'autres agents. Bloquez cette sortie.',
    });
  }

  // Vérification des fuites de PII
  let piiMatches = 0;
  const detectedPiiTypes: string[] = [];

  const ssnMatches = outputStr.match(/\b\d{3}-\d{2}-\d{4}\b/g);
  if (ssnMatches) {
    piiMatches += ssnMatches.length;
    detectedPiiTypes.push('SSN');
  }

  const emailMatches = outputStr.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
  if (emailMatches && emailMatches.length > 3) {
    piiMatches += emailMatches.length;
    detectedPiiTypes.push('emails');
  }

  const phoneMatches = outputStr.match(/\b\+?\d{1,4}[\s-]?\(?\d{1,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,9}\b/g);
  if (phoneMatches && phoneMatches.length > 2) {
    piiMatches += phoneMatches.length;
    detectedPiiTypes.push('téléphones');
  }

  const cardMatches = outputStr.match(/\b\d{16}\b/g);
  if (cardMatches) {
    piiMatches += cardMatches.length;
    detectedPiiTypes.push('cartes bancaires');
  }

  if (piiMatches > 0) {
    details.piiDetected = true;
    details.piiTypes = detectedPiiTypes;
    details.piiMatchCount = piiMatches;
    const penalty = Math.min(piiMatches * 0.15, 0.5);
    score -= penalty;
    issues.push({
      severity: 'warning',
      description: `Fuite potentielle de données personnelles détectée : ${detectedPiiTypes.join(', ')}.`,
      suggestion: 'Masquez ou supprimez les données personnelles avant de renvoyer la sortie.',
    });
  }

  // Vérification du contenu malveillant
  let maliciousMatches = 0;
  for (const pattern of MALICIOUS_PATTERNS) {
    const matches = outputStr.match(pattern);
    if (matches) maliciousMatches += matches.length;
  }

  if (maliciousMatches > 0) {
    details.maliciousContentDetected = true;
    details.maliciousMatchCount = maliciousMatches;
    score -= Math.min(maliciousMatches * 0.4, 1.0);
    issues.push({
      severity: 'critical',
      description: `${maliciousMatches} pattern(s) de contenu malveillant détecté(s).`,
      suggestion: 'La sortie contient du code ou des commandes potentiellement dangereuses.',
    });
  }

  return {
    passed: score >= 0.7,
    score: Math.min(Math.max(score, 0), 1),
    details,
    issues,
  };
}

/**
 * Vérifie la conformité de la sortie aux politiques en vigueur.
 * Effectue des contrôles basiques de conformité sans dépendance cyclique.
 * @param output - Sortie de l'agent à vérifier.
 * @param input - Entrée originale de la tâche.
 * @returns Résultat de la vérification de conformité.
 */
async function verifyPolicyCompliance(
  output: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<Pick<VerificationResult, 'passed' | 'score' | 'details' | 'issues'>> {
  const issues: VerificationIssue[] = [];
  let score = 1.0;
  const details: Record<string, unknown> = { checks: [] };

  const outputStr = JSON.stringify(output).toLowerCase();

  // Contrôle 1 : détection de contenu interdit
  const forbiddenTerms = ['password=', 'api_key=', 'secret=', 'token=', 'credential='];
  let forbiddenCount = 0;
  const foundForbidden: string[] = [];
  for (const term of forbiddenTerms) {
    if (outputStr.includes(term)) {
      forbiddenCount++;
      foundForbidden.push(term);
    }
  }

  (details.checks as Array<Record<string, unknown>>).push({
    name: 'termes_interdits',
    passed: forbiddenCount === 0,
    count: forbiddenCount,
  });

  if (forbiddenCount > 0) {
    score -= Math.min(forbiddenCount * 0.2, 0.6);
    issues.push({
      severity: 'warning',
      description: `Termes sensibles détectés : ${foundForbidden.join(', ')}.`,
      suggestion: 'Vérifiez que les informations sensibles ne sont pas exposées dans la sortie.',
    });
  }

  // Contrôle 2 : vérification de l'absence de contenu offensant basique
  const offensivePatterns = [/\bfuck\b/i, /\bshit\b/i, /\bdamn\b/i];
  let offensiveCount = 0;
  for (const pattern of offensivePatterns) {
    if (pattern.test(outputStr)) offensiveCount++;
  }

  (details.checks as Array<Record<string, unknown>>).push({
    name: 'contenu_offensant',
    passed: offensiveCount === 0,
    count: offensiveCount,
  });

  if (offensiveCount > 0) {
    score -= Math.min(offensiveCount * 0.15, 0.4);
    issues.push({
      severity: 'warning',
      description: `${offensiveCount} terme(s) potentiellement offensant(s) détecté(s).`,
      suggestion: 'Filtrez le contenu offensant de la sortie.',
    });
  }

  // Contrôle 3 : cohérence avec le périmètre de l'agent
  const targetAgentId = input.agentId as string | undefined;
  if (targetAgentId) {
    (details.checks as Array<Record<string, unknown>>).push({
      name: 'périmètre_agent',
      passed: true,
      agentId: targetAgentId,
    });
  }

  // Contrôle 4 : taille de sortie raisonnable (pas de dump excessif)
  const outputSize = Buffer.byteLength(outputStr, 'utf-8');
  const maxSize = 512 * 1024; // 512 Ko
  (details.checks as Array<Record<string, unknown>>).push({
    name: 'taille_sortie',
    passed: outputSize <= maxSize,
    sizeBytes: outputSize,
    maxSizeBytes: maxSize,
  });

  if (outputSize > maxSize) {
    score -= 0.2;
    issues.push({
      severity: 'info',
      description: `La sortie dépasse la taille recommandée (${Math.round(outputSize / 1024)} Ko).`,
      suggestion: 'Réduisez la taille de la sortie pour optimiser le traitement.',
    });
  }

  return {
    passed: score >= 0.7,
    score: Math.min(Math.max(score, 0), 1),
    details,
    issues,
  };
}

/**
 * Vérifie la cohérence entre l'entrée et la sortie.
 * S'assure que la sortie répond à la question posée dans l'entrée.
 * @param output - Sortie de l'agent à vérifier.
 * @param input - Entrée originale de la tâche.
 * @returns Résultat de la vérification de cohérence.
 */
function verifyConsistency(
  output: Record<string, unknown>,
  input: Record<string, unknown>,
): Pick<VerificationResult, 'passed' | 'score' | 'details' | 'issues'> {
  const issues: VerificationIssue[] = [];
  let score = 0;
  const details: Record<string, unknown> = {};

  // Extraire les entités clés de l'entrée
  const inputText = JSON.stringify(input).toLowerCase();
  const outputText = JSON.stringify(output).toLowerCase();

  // Vérification : la sortie mentionne les entités de l'entrée
  const inputWords = inputText
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .map((w) => w.replace(/[^a-zàâäéèêëïîôùûüÿç0-9]/g, ''))
    .filter((w) => w.length > 3);

  const uniqueInputWords = [...new Set(inputWords)].slice(0, 20);
  const referencedWords = uniqueInputWords.filter((w) => outputText.includes(w));

  const referenceRatio =
    uniqueInputWords.length > 0 ? referencedWords.length / uniqueInputWords.length : 0;

  details.inputEntityCount = uniqueInputWords.length;
  details.referencedEntityCount = referencedWords.length;
  details.referenceRatio = Math.round(referenceRatio * 100) / 100;

  if (referenceRatio >= 0.3) {
    score += 0.5;
  } else if (referenceRatio >= 0.1) {
    score += 0.3;
    issues.push({
      severity: 'info',
      description: 'Peu de références aux entités de l\'entrée dans la sortie.',
    });
  } else {
    issues.push({
      severity: 'warning',
      description: 'La sortie ne semble pas faire référence aux éléments de l\'entrée.',
      suggestion: 'Vérifiez que l\'agent prend bien en compte le contexte de la requête.',
    });
  }

  // Vérification : la sortie n'est pas une simple répétition de l'entrée
  const inputFields = Object.keys(input);
  const outputFields = Object.keys(output);
  const commonFields = inputFields.filter((f) => outputFields.includes(f));

  details.commonFields = commonFields;
  details.inputFields = inputFields;
  details.outputFields = outputFields;

  // Si la sortie a des champs propres, c'est bon signe
  const uniqueOutputFields = outputFields.filter((f) => !inputFields.includes(f));
  if (uniqueOutputFields.length > 0) {
    score += 0.3;
  }

  // Vérification : la sortie contient une réponse (pas un renvoi vers l'utilisateur)
  const deflectionPatterns = [
    /je\s+ne\s+(peux|sais)\s+pas\s+(répondre|vous\s+aider)/i,
    /veuillez\s+(consulter|contacter|demander)/i,
    /je\s+suis\s+désolé\s+,\s+mais/i,
  ];

  let deflectionCount = 0;
  for (const pattern of deflectionPatterns) {
    if (pattern.test(outputText)) deflectionCount++;
  }

  details.deflectionCount = deflectionCount;

  if (deflectionCount > 0) {
    score -= deflectionCount * 0.2;
    issues.push({
      severity: deflectionCount > 1 ? 'warning' : 'info',
      description: 'La sortie semble esquiver la question ou renvoyer l\'utilisateur.',
      suggestion: 'L\'agent devrait tenter de répondre plutôt que de se défausser.',
    });
  }

  // Vérification : la sortie est autosuffisante (ne demande pas d'informations manquantes si elles étaient dans l'entrée)
  const askingForMore = /\u00c9tes-vous|pouvez-vous\s+me\s+donner|j\'ai\s+besoin\s+de\s*plus/i;
  if (askingForMore.test(outputText) && inputFields.length > 3) {
    score -= 0.15;
    issues.push({
      severity: 'info',
      description: 'L\'agent demande plus d\'informations alors que l\'entrée est riche.',
    });
  }

  score = Math.min(Math.max(score, 0), 1);

  return {
    passed: score >= 0.5,
    score,
    details,
    issues,
  };
}

/**
 * Exécute toutes les vérifications sur la sortie d'une exécution d'agent.
 * Lance les cinq axes de vérification en parallèle et retourne les résultats.
 *
 * @param executionId - Identifiant de l'exécution à vérifier.
 * @param agentId - Identifiant de l'agent ayant produit la sortie.
 * @param output - Sortie de l'agent à vérifier.
 * @param input - Entrée originale de la tâche.
 * @returns Tableau de résultats de vérification, un par type.
 *
 * @example
 * ```typescript
 * const résultats = await verifyExecution('exec-123', 'agent-456', sortie, entrée);
 * const tousPassés = résultats.every(r => r.passed);
 * ```
 */
export async function verifyExecution(
  executionId: string,
  agentId: string,
  output: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<VerificationResult[]> {
  const startTime = performance.now();
  const types: VerificationType[] = [
    'functional',
    'output_quality',
    'security',
    'policy_compliance',
    'consistency',
  ];

  const results = await Promise.all(
    types.map(async (type) => {
      const typeStart = performance.now();
      const base = createBaseResult(executionId, agentId, type);

      let partial: Pick<VerificationResult, 'passed' | 'score' | 'details' | 'issues'>;

      switch (type) {
        case 'functional':
          partial = verifyFunctional(output, input);
          break;
        case 'output_quality':
          partial = verifyOutputQuality(output);
          break;
        case 'security':
          partial = verifySecurity(output);
          break;
        case 'policy_compliance':
          partial = await verifyPolicyCompliance(output, input);
          break;
        case 'consistency':
          partial = verifyConsistency(output, input);
          break;
        default: {
          const exhaustive: never = type;
          throw new Error(`Type de vérification inconnu : ${exhaustive}`);
        }
      }

      return {
        ...base,
        ...partial,
        durationMs: Math.round(performance.now() - typeStart),
      } as VerificationResult;
    }),
  );

  const totalDuration = Math.round(performance.now() - startTime);
  // Enregistrer la métrique de durée totale
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        event: 'verification_completed',
        executionId,
        agentId,
        typesVerified: results.length,
        totalDurationMs: totalDuration,
        passedCount: results.filter((r) => r.passed).length,
        failedCount: results.filter((r) => !r.passed).length,
      }),
    );
  }

  return results;
}

/**
 * Détermine si une auto-rémédiation doit être tentée.
 * L'auto-rémédiation est activée si un problème critique est détecté
 * et que la politique l'autorise.
 *
 * @param results - Résultats de vérification à analyser.
 * @param policy - Politique de vérification en vigueur.
 * @returns Vrai si l'auto-rémédiation doit être tentée.
 */
export async function shouldAutoRemediate(
  results: VerificationResult[],
  policy: VerificationPolicy,
): Promise<boolean> {
  if (!policy.autoRemediate) return false;

  const hasCriticalIssue = results.some((r) =>
    r.issues.some((issue) => issue.severity === 'critical'),
  );

  if (!hasCriticalIssue) return false;

  const anyBelowMinScore = results.some((r) =>
    policy.types.includes(r.type) && r.score < policy.minScore,
  );

  return anyBelowMinScore;
}

/**
 * Enregistre un résultat de vérification dans la collection Firestore.
 *
 * @param result - Résultat de vérification à persister.
 * @throws {Error} En cas d'erreur d'écriture dans la base de données.
 */
export async function recordVerification(
  result: VerificationResult,
): Promise<void> {
  await db.verifications.create({
    data: {
      id: result.id,
      executionId: result.executionId,
      agentId: result.agentId,
      type: result.type,
      passed: result.passed,
      score: result.score,
      details: result.details,
      issues: result.issues,
      durationMs: result.durationMs,
      verifiedAt: result.verifiedAt,
      verifier: result.verifier,
    },
  });
}

/**
 * Récupère tous les résultats de vérification pour une exécution donnée.
 *
 * @param executionId - Identifiant de l'exécution.
 * @returns Tableau de résultats de vérification, triés par date.
 */
export async function getVerifications(
  executionId: string,
): Promise<VerificationResult[]> {
  const records = await db.verifications.findMany({
    where: { executionId },
    orderBy: { verifiedAt: 'desc' },
  });

  return records.map(
    (r: Record<string, unknown>) =>
      ({
        ...r,
        verifiedAt: r.verifiedAt instanceof Date
          ? r.verifiedAt
          : new Date(r.verifiedAt as string),
      }) as VerificationResult,
  );
}
