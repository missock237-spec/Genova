/**
 * @module observability/tracing
 * @description Traçage distribué avec identifiants de corrélation.
 * Fournit un traceur simple pour le suivi des requêtes à travers
 * les différents services et agents de la plateforme Gen3ia.
 */

import type { Span, LogEntry } from './types';

/**
 * Génère un identifiant de corrélation unique.
 * Utilisé pour relier toutes les opérations d'une même requête.
 *
 * @returns Identifiant de corrélation au format UUID.
 *
 * @example
 * ```typescript
 * const cid = generateCorrelationId();
 * // 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
 * ```
 */
export function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Solution de repli pour les environnements sans crypto.randomUUID
  const segments: string[] = [];
  for (let i = 0; i < 4; i++) {
    segments.push(Math.random().toString(16).substring(2, 10));
  }
  return `${segments[0]}${segments[1]}-${segments[2]}-${segments[3]}`;
}

/**
 * Génère un identifiant de trace unique.
 * Représente l'ensemble d'une chaîne d'opérations.
 *
 * @returns Identifiant de trace au format hexadécimal de 32 caractères.
 */
export function generateTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    parts.push(Math.random().toString(16).substring(2, 10));
  }
  return parts.join('');
}

/**
 * Génère un identifiant de span unique.
 * Un span est une unité de travail au sein d'une trace.
 *
 * @returns Identifiant de span au format hexadécimal de 16 caractères.
 */
export function generateSpanId(): string {
  if (typeof crypto !== 'undefined') {
    const buffer = new Uint8Array(8);
    crypto.getRandomValues(buffer);
    return Array.from(buffer)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return Math.random().toString(16).substring(2, 18);
}

/**
 * Traceur distribué pour le suivi des opérations.
 *
 * Maintient une liste des spans actifs et permet de créer
 * des spans imbriqués pour représenter les appels entre services.
 *
 * @example
 * ```typescript
 * const tracer = new Tracer('agent-orchestrator');
 * const parent = tracer.startSpan('traitement_requête');
 * const child = tracer.startSpan('appel_llm', parent.spanId);
 * // ... travail ...
 * tracer.endSpan(child);
 * tracer.endSpan(parent);
 * ```
 */
export class Tracer {
  /** Nom du service tracé */
  private readonly serviceName: string;
  /** Ensemble des spans actifs */
  private activeSpans: Span[] = [];

  /**
   * Crée une nouvelle instance du traceur.
   *
   * @param serviceName - Nom du service à tracer.
   */
  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Démarre un nouveau span de traçage.
   *
   * @param operationName - Nom de l'opération représentée par ce span.
   * @param parentSpanId - Identifiant du span parent, si imbriqué.
   * @param tags - Étiquettes de contexte à attacher au span.
   * @returns Le span nouvellement créé.
   */
  startSpan(
    operationName: string,
    parentSpanId?: string,
    tags?: Record<string, string>,
  ): Span {
    const span: Span = {
      traceId: parentSpanId
        ? (this.activeSpans.find((s) => s.spanId === parentSpanId)?.traceId ?? generateTraceId())
        : generateTraceId(),
      spanId: generateSpanId(),
      parentSpanId,
      operationName,
      startTime: Date.now(),
      status: 'ok',
      tags: { service: this.serviceName, ...tags },
      logs: [],
    };

    this.activeSpans.push(span);
    return span;
  }

  /**
   * Termine un span et calcule sa durée.
   *
   * @param span - Le span à terminer.
   * @param status - Statut final (défaut 'ok').
   * @returns Le span mis à jour avec endTime et durationMs.
   */
  endSpan(span: Span, status: 'ok' | 'error' = 'ok'): Span {
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status;

    // Retirer des spans actifs
    this.activeSpans = this.activeSpans.filter((s) => s.spanId !== span.spanId);

    // Journaliser la fin du span en JSON (compatible avec les agrégateurs)
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `span_ended: ${span.operationName}`,
      service: this.serviceName,
      correlationId: span.traceId,
      durationMs: span.durationMs,
      metadata: {
        spanId: span.spanId,
        traceId: span.traceId,
        parentSpanId: span.parentSpanId,
        operationName: span.operationName,
        status: span.status,
        tags: span.tags,
      },
    };

    console.log(JSON.stringify(logEntry));

    return span;
  }

  /**
   * Retourne tous les spans actuellement actifs (non terminés).
   *
   * @returns Copie du tableau des spans actifs.
   */
  getActiveSpans(): Span[] {
    return [...this.activeSpans];
  }
}

/**
 * Instance singleton du traceur global.
 * Utilisée pour les opérations de traçage à l'échelle de la plateforme.
 *
 * @example
 * ```typescript
 * import { globalTracer } from '@/lib/observability';
 * const span = globalTracer.startSpan('requete_api');
 * // ... traitement ...
 * globalTracer.endSpan(span);
 * ```
 */
export const globalTracer = new Tracer('gen3ia');
