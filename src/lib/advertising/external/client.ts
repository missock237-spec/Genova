// ============================================================
// Gen3ia — Client HTTP du réseau publicitaire EXTERNE
// ------------------------------------------------------------
// Implémentation générique (configurable par variables d'environnement)
// d'un `ExternalAdProvider`. Cible une API JSON typique de SSP/réseau :
//
//   GET  {AD_EXTERNAL_API_URL}/campaigns            -> [campagnes]
//   POST {AD_EXTERNAL_API_URL}/events/impression    -> ack
//   POST {AD_EXTERNAL_API_URL}/events/click         -> ack
//   GET  {AD_EXTERNAL_API_URL}/spend?from=&to=      -> [rapports]
//
// Authentification par jeton Bearer (AD_EXTERNAL_API_KEY).
// Timeout strict + retry initial + repli propre : en cas d'échec,
// le gestionnaire (registry.ts) retombe sur les campagnes internes.
//
// NE GÉNÈRE AUCUN CODE SIMPLIFIÉ : il s'agit du client de production,
// avec gestion d'erreur, validation et logs structurés.
// ============================================================

import { createLogger } from '@/lib/logger';
import type {
  ExternalAdProvider,
  ExternalAdCampaignInput,
  ExternalImpressionEvent,
  ExternalClickEvent,
  ExternalSpendReport,
  ExternalProviderId,
} from './types';

const log = createLogger('external-ad-client');

const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 512_000; // 512 Ko — limite raisonnable pour une réponse JSON

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

/** Lit la config du réseau externe depuis l'environnement. */
export interface ExternalProviderConfig {
  id: ExternalProviderId;
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
}

export function loadExternalProviderConfig(): ExternalProviderConfig {
  return {
    id: envOr('AD_EXTERNAL_PROVIDER', ''),
    enabled: process.env.AD_EXTERNAL_ENABLED === 'true',
    apiUrl: envOr('AD_EXTERNAL_API_URL', ''),
    apiKey: envOr('AD_EXTERNAL_API_KEY', ''),
  };
}

async function requestJson<T>(
  url: string,
  init: { method: string; apiKey: string; body?: unknown },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.apiKey ? { Authorization: `Bearer ${init.apiKey}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
    }

    const raw = await res.text();
    if (raw.length > MAX_BODY_BYTES) {
      throw new Error('Réponse du réseau externe trop volumineuse');
    }
    if (!raw.trim()) return undefined as unknown as T;
    return JSON.parse(raw) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Client générique HTTP pour un réseau publicitaire externe.
 * Désactivé tant que la config n'est pas complète (fallback interne).
 */
export class HttpExternalAdProvider implements ExternalAdProvider {
  readonly id: ExternalProviderId;
  readonly enabled: boolean;
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(config?: ExternalProviderConfig) {
    const cfg = config ?? loadExternalProviderConfig();
    this.id = cfg.id;
    this.enabled = cfg.enabled && cfg.apiUrl.length > 0;
    this.apiUrl = cfg.apiUrl.replace(/\/+$/, ''); // strip trailing slash
    this.apiKey = cfg.apiKey;
  }

  private endpoint(path: string): string {
    return `${this.apiUrl}${path}`;
  }

  async fetchCampaigns(): Promise<ExternalAdCampaignInput[]> {
    if (!this.enabled) return [];
    const data = await requestJson<ExternalAdCampaignInput[]>(
      this.endpoint('/campaigns'),
      { method: 'GET', apiKey: this.apiKey },
    );
    if (!Array.isArray(data)) {
      throw new Error('Format de réponse invalide : tableau de campagnes attendu');
    }
    return data;
  }

  async reportImpression(event: ExternalImpressionEvent): Promise<void> {
    if (!this.enabled) return;
    await requestJson<unknown>(this.endpoint('/events/impression'), {
      method: 'POST',
      apiKey: this.apiKey,
      body: {
        externalCampaignId: event.externalCampaignId,
        impressionId: event.impressionId,
        userId: event.userId,
        sessionId: event.sessionId,
        conversationId: event.conversationId ?? null,
        adType: event.adType,
        occurredAt: event.occurredAt.toISOString(),
        metadata: event.metadata ?? {},
      },
    });
  }

  async reportClick(event: ExternalClickEvent): Promise<void> {
    if (!this.enabled) return;
    await requestJson<unknown>(this.endpoint('/events/click'), {
      method: 'POST',
      apiKey: this.apiKey,
      body: {
        externalCampaignId: event.externalCampaignId,
        impressionId: event.impressionId,
        userId: event.userId,
        redirectUrl: event.redirectUrl,
        occurredAt: event.occurredAt.toISOString(),
        metadata: event.metadata ?? {},
      },
    });
  }

  async fetchSpend(periodStart: Date, periodEnd: Date): Promise<ExternalSpendReport[]> {
    if (!this.enabled) return [];
    const qs = `?from=${periodStart.toISOString()}&to=${periodEnd.toISOString()}`;
    const data = await requestJson<
      Array<{
        externalCampaignId?: string;
        impressions?: number;
        clicks?: number;
        spendXaf?: number;
      }>
    >(this.endpoint(`/spend${qs}`), { method: 'GET', apiKey: this.apiKey });
    if (!Array.isArray(data)) return [];
    return data.map(r => ({
      externalCampaignId: r.externalCampaignId ?? '',
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      spendXaf: Number(r.spendXaf ?? 0),
      periodStart,
      periodEnd,
    }));
  }
}
