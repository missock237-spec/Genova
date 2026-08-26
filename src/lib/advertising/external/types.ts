// ============================================================
// Gen3ia — Connexion au service de publicité EXTERNE
// ------------------------------------------------------------
// Types partagés du connecteur de réseau publicitaire externe.
// Permet de brancher un échange / SSP / réseau (Google Ads, RTB,
// ou une API propriétaire) sur l'AdEngine existant, sans le modifier.
//
// Un "provider" externe est une implémentation de `ExternalAdProvider`
// qui :
//   - récupère des campagnes (fetchCampaigns)
//   - notifie une impression (reportImpression)
//   - notifie un clic (reportClick)
//   - synchronise le spend facturable (syncSpend)
//
// Les campagnes externes sont normalisées vers le format `AdCampaign`
// de l'AdEngine afin d'être servies côte à côte avec les campagnes
// internes (house ads / campagnes annonceurs Firestore).
// ============================================================

import type { AdCampaign } from '@/lib/advertising/ad-engine';

/** Identificateur de réseau externe (ex: google, rtb_house, ssp_africa). */
export type ExternalProviderId = string;

export interface ExternalAdCampaignInput {
  externalId: string;      // ID de la campagne coté réseau externe
  name: string;
  description?: string;
  advertiserName: string;
  advertiserUrl: string;
  textContent: string;
  ctaText: string;
  ctaUrl: string;
  targetPlan?: 'all' | 'free' | 'paid';
  costPerView?: number;
  costPerClick?: number;
  rewardPerView?: number;
  rewardPerClick?: number;
  budgetTotal?: number;
  startAt?: string | null;
  endAt?: string | null;
  targetCountries?: string[];
  targetKeywords?: string;
  frequencyCap?: number;
}

// Alias de rétrocompatibilité : `registry.ts` référençait historiquement
// ce nom. Le canonique reste `ExternalAdCampaignInput`.
export type ExternalCampaignInput = ExternalAdCampaignInput;

export interface ExternalImpressionEvent {
  externalCampaignId: string;
  userId: string;
  sessionId: string;
  conversationId?: string;
  impressionId: string;
  adType: 'unrewarded' | 'rewarded';
  occurredAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ExternalClickEvent {
  externalCampaignId: string;
  impressionId: string;
  userId: string;
  redirectUrl: string;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ExternalSpendReport {
  externalCampaignId: string;
  impressions: number;
  clicks: number;
  spendXaf: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface ExternalSyncResult {
  providerId: ExternalProviderId;
  fetched: number;
  syncedEvents: number;
  ok: boolean;
  error?: string;
}

/**
 * Contrat d'un réseau publicitaire externe.
 * Toute implémentation (HTTP, SDK, ...) doit respecter cette interface.
 */
export interface ExternalAdProvider {
  readonly id: ExternalProviderId;
  readonly enabled: boolean;

  /** Récupère les campagnes actives du réseau externe. */
  fetchCampaigns(): Promise<ExternalAdCampaignInput[]>;

  /** Notifie une impression au réseau externe (fire-and-forget de préférence). */
  reportImpression(event: ExternalImpressionEvent): Promise<void>;

  /** Notifie un clic au réseau externe. */
  reportClick(event: ExternalClickEvent): Promise<void>;

  /** Récupère le spend facturable (pour rapprochement). */
  fetchSpend(periodStart: Date, periodEnd: Date): Promise<ExternalSpendReport[]>;
}

/** Campagne externe normalisée vers le format interne AdCampaign. */
export type NormalizedExternalCampaign = AdCampaign & {
  /** ID du réseau externe d'origine. */
  externalProviderId: ExternalProviderId;
  /** ID de campagne côté réseau externe. */
  externalCampaignId: string;
};
