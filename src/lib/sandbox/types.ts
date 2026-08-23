/**
 * @module sandbox/types
 * @description Types et interfaces du bac à sable d'exécution Gen3ia.
 * Définit les configurations d'isolation et les structures de résultat.
 */

/**
 * Configuration du bac à sable d'exécution.
 * Définit les limites de ressources et les accès autorisés.
 * @interface SandboxConfig
 */
export interface SandboxConfig {
  /** Délai d'exécution maximum en millisecondes */
  timeoutMs: number;
  /** Mémoire maximale autorisée en mégaoctets */
  maxMemoryMb: number;
  /** Pourcentage CPU maximal autorisé */
  maxCpuPercent: number;
  /** Autorise ou non l'accès réseau */
  networkAccess: boolean;
  /** Chemins de système de fichiers autorisés en lecture/écriture */
  allowedPaths: string[];
  /** Variables d'environnement disponibles dans le bac à sable */
  envVars?: Record<string, string>;
}

/**
 * Résultat d'une exécution en bac à sable.
 * Contient les sorties, le statut et les métriques d'exécution.
 * @interface SandboxResult
 */
export interface SandboxResult {
  /** Indique si l'exécution a réussi sans erreur */
  success: boolean;
  /** Sortie standard du code exécuté */
  stdout: string;
  /** Sortie d'erreur du code exécuté */
  stderr: string;
  /** Code de sortie du processus, ou null si arrêté par timeout */
  exitCode: number | null;
  /** Durée réelle de l'exécution en millisecondes */
  durationMs: number;
  /** Mémoire utilisée en mégaoctets (estimée) */
  memoryUsedMb: number;
  /** Indique si l'exécution a été interrompue par le délai */
  timedOut: boolean;
  /** Message d'erreur, si l'exécution a échoué */
  error?: string;
}
