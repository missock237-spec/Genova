// ============================================================
// Gen3ia — Gestionnaire du réseau publicitaire EXTERNE
// ------------------------------------------------------------
// Singleton `getExternalAdManager()` qui :
//   - instancie les providers externes configurés (HTTP générique,
//     extensible à d'autres implémentations ultérieurement)
//   - rafraîchit/mise en cache les campagnes externes, normalisées
//     au format `AdCampaign` de l'AdEngine
//   - synchronise les events (impression/clic) vers le réseau externe
//   - effectue le rapprochement du spend facturable externe
//
// IMPORTANT — intégration additive : l'AdEngine existant n'est PAS
// modifié. Pour servir des campagnes externes, appeler
// `externalManager.getActiveExternalCampaigns()` et fusionner le
// résultat avec `engine.getActiveCampaigns()` (voir la doc).
// En cas d'échec réseau, on retourne une liste vide → repli sur les
// campagnes internes, sans interruption du service.
// ============================================================

import { createLogger } from '@/lib/logger';
import type {
  AdCampaign,
  AdPlacement,
} from '@/lib/advertising/ad-engine';
import {
  HttpExternalAdProvider,
  loadExternalProviderConfig,
} from './client';
import type {
  ExternalAdProvider,
  ExternalCampaignInput,
  ExternalImpressionEvent,
  ExternalClickEvent,
  ExternalSpendReport,
  ExternalSyncResult,
  NormalizedExternalCampaign,
} from './types';

const log = createLogger('external-ad-manager');

// Durée de vie du cache de campagnes externes (réduit les appels sortants).
const EXTERNAL_CACHE_TTL = 60_000;

export class ExternalAdManager {
  private providers: ExternalAdProvider[] = [];
  private cache: {
    timestamp: number;
    campaigns: NormalizedExternalCampaign[];
  } = { timestamp: 0, campaigns: [] };

  constructor() {
    // Le provider HTTP générique est chargé si configuré.
    // D'autres providers (Google Ads, RTB maison...) s'ajoutent ici.
    const cfg = loadExternalProviderConfig();
    if (cfg.enabled && cfg.apiUrl) {
      this.providers.push(new HttpExternalAdProvider(cfg));
    }
  }

  get enabledProviders(): ExternalProviderId[] {
    return this.providers.filter(p => p.enabled).map(p => p.id);
  }

  /**
   * Récupère (avec cache) les campagnes externes normalisées.
   * En cas d'échec d'un provider, il est ignoré (log + repli interne).
   */
  async getActiveExternalCampaigns(): Promise<NormalizedExternalCampaign[]> {
    const now = Date.now();
    if (now - this.cache.timestamp < EXTERNAL_CACHE_TTL) {
      return this.cache.campaigns;
    }

    const collected: NormalizedExternalCampaign[] = [];
    for (const provider of this.providers) {
      if (!provider.enabled) continue;
      try {
        const inputs = await provider.fetchCampaigns();
        for (const input of inputs) {
          collected.push(this.normalize(provider.id, input));
        }
      } catch (err) {
        log.error('external_fetch_failed', {
          provider: provider.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.cache = { timestamp: now, campaigns: collected };
    return collected;
  }

  /**
   * Fusionne campagnes internes + externes en une liste unique servable.
   * Les campagnes externes portent `externalProviderId` et
   * `externalCampaignId` pour le rapprochement et le sync d'events.
   */
  async getCombinedCampaigns(internal: AdCampaign[]): Promise<AdCampaign[]> {
    const external = await this.getActiveExternalCampaigns();
    return [...internal, ...external];
  }

  /**
   * Normalise une campagne externe vers le format AdCampaign interne.
   * `targetPlan` par défaut 'all', placement conversation_inline.
   */
  private normalize(
    providerId: string,
    input: ExternalCampaignInput,
  ): NormalizedExternalCampaign {
    const now = new Date();
    return {
      id: `ext:${providerId}:${input.externalId}`,
      externalProviderId: providerId,
      externalCampaignId: input.externalId,
      name: input.name,
      description: input.description ?? '',
      advertiserName: input.advertiserName,
      advertiserUrl: input.advertiserUrl,
      textContent: input.textContent,
      ctaText: input.ctaText,
      ctaUrl: input.ctaUrl,
      targetPlan: input.targetPlan ?? 'all',
      maxImpressions: 0,
      maxClicks: 0,
      rewardPerView: input.rewardPerView ?? 0,
      rewardPerClick: input.rewardPerClick ?? 0,
      costPerView: input.costPerView ?? 0,
      costPerClick: input.costPerClick ?? 0,
      budgetTotal: input.budgetTotal ?? 0,
      budgetSpent: 0,
      status: 'active',
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
      isActive: true,
      placement: 'conversation_inline' as AdPlacement,
      targetKeywords: input.targetKeywords,
      targetCountries: input.targetCountries ?? [],
      frequencyCap: input.frequencyCap,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Notifie une impression au réseau externe d'origine.
   * Fire-and-forget : n'échoue jamais la requête appelante.
   */
  async syncImpression(event: ExternalImpressionEvent): Promise<void> {
    const provider = this.providers.find(p => p.enabled);
    if (!provider) return;
    try {
      await provider.reportImpression(event);
    } catch (err) {
      log.warn('external_impression_sync_failed', {
        provider: provider.id,
        externalCampaignId: event.externalCampaignId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Notifie un clic au réseau externe d'origine (fire-and-forget).
   */
  async syncClick(event: ExternalClickEvent): Promise<void> {
    const provider = this.providers.find(p => p.enabled);
    if (!provider) return;
    try {
      await provider.reportClick(event);
    } catch (err) {
      log.warn('external_click_sync_failed', {
        provider: provider.id,
        impressionId: event.impressionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Rapprochement du spend externe facturable (pour la facturation).
   */
  async reconcileExternalSpend(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{
    providerId: string;
    reports: ExternalSpendReport[];
  }> {
    const out: { providerId: string; reports: ExternalSpendReport[] }[] = [];
    for (const provider of this.providers) {
      if (!provider.enabled) continue;
      try {
        const reports = await provider.fetchSpend(periodStart, periodEnd);
        out.push({ providerId: provider.id, reports });
      } catch (err) {
        log.warn('external_spend_fetch_failed', {
          provider: provider.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return out[0] ?? { providerId: '', reports: [] };
  }

  /**
   * Synchronise (force) toutes les campagnes externes + renvoie un
   * état de synthèse pour l'endpoint admin.
   */
  async syncAll(): Promise<ExternalSyncResult[]> {
    const results: ExternalSyncResult[] = [];
    for (const provider of this.providers) {
      try {
        const campaigns = await provider.fetchCampaigns();
        results.push({
          providerId: provider.id,
          fetched: campaigns.length,
          syncedEvents: 0,
          ok: true,
        });
      } catch (err) {
        results.push({
          providerId: provider.id,
          fetched: 0,
          syncedEvents: 0,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.cache.timestamp = 0; // invalide le cache
    return results;
  }
}

// ============================================================
// Singleton
// ============================================================

let instance: ExternalAdManager | null = null;

export function getExternalAdManager(): ExternalAdManager {
  if (!instance) instance = new ExternalAdManager();
  return instance;
}
