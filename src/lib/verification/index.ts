/**
 * @module verification
 * @description Point d'entrée du moteur de vérification Gen3ia.
 * Réexporte les types, le moteur de vérification et les fonctions utilitaires.
 */

export type {
  VerificationType,
  VerificationResult,
  VerificationIssue,
  VerificationPolicy,
} from './types';

export {
  verifyExecution,
  shouldAutoRemediate,
  recordVerification,
  getVerifications,
} from './engine';
