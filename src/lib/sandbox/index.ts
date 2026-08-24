/**
 * @module sandbox
 * @description Point d'entrée du bac à sable d'exécution Gen3ia.
 * Réexporte les types, la fonction d'exécution et l'analyse statique.
 */

export type { SandboxConfig, SandboxResult } from './types';

export { executeInSandbox, validateCode, DEFAULT_SANDBOX_CONFIG } from './sandbox';
