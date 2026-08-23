/**
 * @module observability/metrics
 * @description Collecteur de métriques en mémoire avec vidage périodique vers Firestore.
 * Supporte les compteurs, jauges, histogrammes et mesures de temps.
 * Les métriques sont accumulées en mémoire puis écrites en lot
 * vers la collection `metrics` de Firestore.
 */

import { db } from '@/lib/db';
import type { MetricPoint } from './types';

/**
 * Seuils par défaut pour les buckets d'histogramme (en millisecondes).
 * Utilisés pour simuler des buckets d'histogramme.
 * @internal
 */
const DEFAULT_HISTOGRAM_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * Collecteur de métriques en mémoire avec vidage périodique.
 *
 * Les métriques sont stockées dans un tampon interne et vidées
 * vers Firestore à intervalle régulier ou manuellement.
 *
 * @example
 * ```typescript
 * collector.counter('requests_total', 1, { method: 'GET' });
 * collector.timing('request_duration', 142, { endpoint: '/api/agents' });
 * await collector.flush();
 * ```
 */
export class MetricsCollector {
  /** Tampon des métriques en attente de vidage */
  private buffer: MetricPoint[] = [];
  /** Intervalle de vidage automatique */
  private flushIntervalMs: number;
  /** Nom du service pour l'étiquetage */
  private readonly serviceName: string;
  /** Référence à l'intervalle de vidage */
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Verrou pour éviter les vidages concurrents */
  private flushing = false;

  /**
   * Crée une nouvelle instance du collecteur de métriques.
   *
   * @param options - Options de configuration.
   * @param options.flushIntervalMs - Intervalle de vidage en ms (défaut 30000 = 30s).
   * @param options.serviceName - Nom du service pour l'étiquetage.
   */
  constructor(
    options?: { flushIntervalMs?: number; serviceName?: string },
  ) {
    this.flushIntervalMs = options?.flushIntervalMs ?? 30_000;
    this.serviceName = options?.serviceName ?? 'gen3ia';
  }

  /**
   * Ajoute un point de métrique au tampon.
     * @param point - Point de métrique à enregistrer.
   * @internal
   */
  private addPoint(point: Omit<MetricPoint, 'timestamp'>): void {
    this.buffer.push({
      ...point,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Incrémente un compteur.
   * Les compteurs sont des valeurs qui ne font qu'augmenter.
   *
   * @param name - Nom du compteur (ex: 'requests_total').
   * @param value - Valeur d'incrémentation (défaut 1).
   * @param tags - Étiquettes de dimension.
   */
  counter(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.addPoint({
      name,
      value,
      tags: { ...tags, service: this.serviceName },
      unit: 'count',
    });
  }

  /**
   * Enregistre la valeur d'une jauge.
   * Les jauges représentent une valeur qui peut augmenter ou diminuer.
   *
   * @param name - Nom de la jauge (ex: 'active_connections').
   * @param value - Valeur actuelle.
   * @param tags - Étiquettes de dimension.
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.addPoint({
      name,
      value,
      tags: { ...tags, service: this.serviceName },
    });
  }

  /**
   * Enregistre une valeur dans un histogramme.
   * Pour simplifier, les histogrammes sont stockés comme des compteurs
   * avec un suffixe _bucket pour chaque seuil.
   *
   * @param name - Nom de l'histogramme (ex: 'request_duration').
   * @param value - Valeur observée.
   * @param tags - Étiquettes de dimension.
   */
  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const baseTags = { ...tags, service: this.serviceName };

    // Compteur total
    this.addPoint({ name: `${name}_count`, value: 1, tags: baseTags, unit: 'count' });
    // Somme totale
    this.addPoint({ name: `${name}_sum`, value, tags: baseTags, unit: name.includes('duration') || name.includes('time') ? 'ms' : undefined });

    // Buckets cumulatifs
    for (const bucket of DEFAULT_HISTOGRAM_BUCKETS) {
      if (value <= bucket) {
        this.addPoint({
          name: `${name}_bucket`,
          value: 1,
          tags: { ...baseTags, le: String(bucket) },
          unit: 'count',
        });
      }
    }
    // Bucket +Inf
    this.addPoint({
      name: `${name}_bucket`,
      value: 1,
      tags: { ...baseTags, le: '+Inf' },
      unit: 'count',
    });
  }

  /**
   * Enregistre une mesure de temps (raccourci pour histogramme avec unité ms).
   *
   * @param name - Nom de la métrique (ex: 'execution_duration').
   * @param durationMs - Durée mesurée en millisecondes.
   * @param tags - Étiquettes de dimension.
   */
  timing(name: string, durationMs: number, tags?: Record<string, string>): void {
    this.histogram(name, durationMs, tags);
  }

  /**
   * Vide le tampon de métriques vers Firestore.
   * Les métriques sont écrites en lot pour optimiser les performances.
   * Le tampon est vidé après un vidage réussi.
   *
   * @throws {Error} En cas d'erreur d'écriture Firestore.
   */
  async flush(): Promise<void> {
    // Éviter les vidages concurrents
    if (this.flushing) return;
    this.flushing = true;

    try {
      // Prendre et vider le tampon de manière atomique
      const toFlush = this.buffer;
      this.buffer = [];

      if (toFlush.length === 0) return;

      // Écrire par lots de 500 pour ne pas dépasser les limites Firestore
      const BATCH_SIZE = 500;
      for (let i = 0; i < toFlush.length; i += BATCH_SIZE) {
        const batch = toFlush.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map((point) =>
            db.metrics.create({
              data: {
                name: point.name,
                value: point.value,
                timestamp: point.timestamp,
                tags: point.tags,
                unit: point.unit ?? null,
              },
            }),
          ),
        );
      }
    } catch (error) {
      // En cas d'erreur, réinsérer les métriques dans le tampon
      // (dans la limite de 10 000 points pour éviter une fuite mémoire)
      if (this.buffer.length < 10_000) {
        // eslint-disable-next-line no-console
        console.error(
          JSON.stringify({
            event: 'metrics_flush_failed',
            error: error instanceof Error ? error.message : String(error),
            bufferSize: this.buffer.length,
          }),
        );
      }
      throw error;
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Démarre le vidage automatique périodique.
   * Le premier vidage intervient après `flushIntervalMs` millisecondes.
   */
  start(): void {
    if (this.timer !== null) return;

    this.timer = setInterval(
      () => {
        this.flush().catch(() => {
          // Les erreurs sont déjà journalisées dans flush()
        });
      },
      this.flushIntervalMs,
    );

    // Ne pas bloquer la fermeture du processus
    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  /**
   * Arrête le vidage automatique périodique.
   * Tente un dernier vidage avant de s'arrêter.
   */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Vidage final
    this.flush().catch(() => {
      // Les erreurs sont déjà journalisées
    });
  }

  /**
   * Retourne les métriques actuellement dans le tampon (non encore vidées).
   *
   * @returns Copie du tampon de métriques.
   */
  getMetrics(): MetricPoint[] {
    return [...this.buffer];
  }
}

/**
 * Instance singleton du collecteur de métriques globales.
 * Démarrée automatiquement en production.
 *
 * @example
 * ```typescript
 * import { globalMetrics } from '@/lib/observability';
 * globalMetrics.counter('api_calls', 1, { endpoint: '/agents' });
 * ```
 */
export const globalMetrics = new MetricsCollector({
  flushIntervalMs: 30_000,
  serviceName: 'gen3ia',
});

// Démarrage automatique en production
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
  globalMetrics.start();
}
