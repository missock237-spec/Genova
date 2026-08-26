// ============================================================
// Gen3ia — Ad Serving combiné (interne + externe) — WRAPPER NON INVASIF
// ------------------------------------------------------------
// Point d'intégration ADDITIF qui câble le réseau publicitaire EXTERNE
// sur la décision de diffusion, SANS modifier `ad-engine.ts`.
//
// Les appelants qui veulent servir automatiquement les campagnes
// externes utilisent `decideAdCombined()` au lieu de
// `engine.decideAd()`. Il :
//   1. délègue d'abord la décision à l'AdEngine (campagnes internes,
//      règles de plan, house ads, A/B, anti-abus, frequency caps) ;
//   2. si la décision interne est déjà positive, il la renvoie telle
//      quelle (comportement inchangé) ;
//   3. sinon, il tente les campagnes externes via `ExternalAdManager`
//      pour compenser les cas `NO_ACTIVE_CAMPAIGN` / `NO_MATCHING_CAMPAIGN` ;
//   4. toute campagne externe servie est marquée pour permettre le
//      sync impression/clic vers le réseau d'origine (fire-and-forget).
//
// Aucune modification de l'AdEngine, des routes existantes ou du
// schéma Firestore. En cas d'échec du réseau externe, repli propre.
// ============================================================

import { createLogger } from '@/lib/logger';
import {
  getAdEngine,
  type AdServingDecision,
  type AdCampaign,
  type AdPlacement,
} from '@/lib/advertising/ad-engine';
import {
  getExternalAdManager,
} from '@/lib/advertising/external/registry';
import type { NormalizedExternalCampaign } from '@/lib/advertising/external/types';

const log = createLogger('ad-serving');

export interface CombinedAdServingDecision extends AdServingDecision {
  /** True si la campagne servie provient du réseau externe. */
  isExternal: boolean;
  /** ID du réseau externe d'origine (si externe). */
  externalProviderId?: string;
  /** ID de campagne côté réseau externe (si externe). */
  externalCampaignId?: string;
}

function isExternalCampaign(c: AdCampaign): c is NormalizedExternalCampaign {
  return 'externalProviderId' in c && typeof (c as NormalizedExternalCampaign).externalProviderId === 'string';
}

/**
 * Décide quelle publicité servir en combinant campagnes internes et
 * externes. Délègue à l'AdEngine, puis compense via le réseau externe.
 */
export async function decideAdCombined(
  userId: string,
  sessionId: string,
  conversationId?: string,
  context?: { keywords?: string[]; placement?: AdPlacement; conversationTopic?: string; country?: string },
): Promise<CombinedAdServingDecision> {
  const engine = getAdEngine();
  const decision = await engine.decideAd(userId, sessionId, conversationId, context);

  // Si l'AdEngine a déjà une réponse positive, on la conserve telle quelle.
  if (decision.shouldShow && decision.campaign) {
    return { ...decision, isExternal: false };
  }

  // Sinon (NO_ACTIVE_CAMPAIGN / NO_MATCHING_CAMPAIGN), tenter l'externe.
  const manager = getExternalAdManager();
  let external: NormalizedExternalCampaign[] = [];
  try {
    external = await manager.getActiveExternalCampaigns();
  } catch (err) {
    log.warn('external_campaigns_unavailable', {
      error: err instanceof Error ? err.message : String(err),
    });
    external = [];
  }

  if (external.length === 0) {
    return { ...decision, isExternal: false };
  }

  const selected = pickExternalCampaign(external, context, userId);
  if (!selected) {
    return { ...decision, isExternal: false };
  }

  return {
    ...decision,
    shouldShow: true,
    adType: decision.adType,
    campaign: selected,
    reason: 'EXTERNAL_AD',
    placement: selected.placement,
    pendingRewardPerView: decision.pendingRewardPerView,
    pendingRewardPerClick: decision.pendingRewardPerClick,
    isExternal: true,
    externalProviderId: selected.externalProviderId,
    externalCampaignId: selected.externalCampaignId,
  };
}

/**
 * Sélectionne une campagne externe en respectant le plan cible, le
 * placement, le géo-ciblage et un facteur aléatoire simple de rotation.
 */
function pickExternalCampaign(
  campaigns: NormalizedExternalCampaign[],
  context: { keywords?: string[]; placement?: AdPlacement; country?: string } | undefined,
  userId: string,
): NormalizedExternalCampaign | null {
  const placement = context?.placement ?? 'conversation_inline';
  let candidates = campaigns.filter(c => c.targetPlan === 'all' || c.targetPlan === (userId ? 'paid' : 'free'));
  if (candidates.length === 0) candidates = campaigns;

  const byPlacement = candidates.filter(c => c.placement === placement);
  if (byPlacement.length > 0) candidates = byPlacement;

  if (context?.country) {
    const cc = context.country.toUpperCase();
    const matched = candidates.filter(c => !c.targetCountries || c.targetCountries.length === 0 || c.targetCountries.includes(cc));
    if (matched.length > 0) candidates = matched;
  }

  if (candidates.length === 0) return null;
  // Rotation aléatoire simple (les campagnes externes n'ont pas de budget
  // interne géré ici — le réseau s'en charge).
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

/**
 * Notifie une impression d'une campagne servie au réseau externe
 * d'origine (fire-and-forget). Doit être appelé par la route d'impression
 * quand `decision.isExternal === true`.
 */
export async function syncExternalImpression(params: {
  campaignId: string;
  userId: string;
  sessionId: string;
  conversationId?: string;
  impressionId: string;
  adType: 'unrewarded' | 'rewarded';
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const manager = getExternalAdManager();
  const ref = manager.resolveExternalRef(params.campaignId);
  if (!ref) return;
  try {
    await manager.syncImpression({
      externalCampaignId: ref.externalCampaignId,
      userId: params.userId,
      sessionId: params.sessionId,
      conversationId: params.conversationId,
      impressionId: params.impressionId,
      adType: params.adType,
      occurredAt: params.occurredAt ?? new Date(),
      metadata: params.metadata,
    });
  } catch (err) {
    log.warn('external_impression_sync_failed', { error: String(err) });
  }
}

/**
 * Notifie un clic d'une campagne servie au réseau externe d'origine
 * (fire-and-forget). À appeler quand `campaignId` est externe.
 */
export async function syncExternalClick(params: {
  campaignId: string;
  impressionId: string;
  userId: string;
  redirectUrl: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const manager = getExternalAdManager();
  const ref = manager.resolveExternalRef(params.campaignId);
  if (!ref) return;
  try {
    await manager.syncClick({
      externalCampaignId: ref.externalCampaignId,
      impressionId: params.impressionId,
      userId: params.userId,
      redirectUrl: params.redirectUrl,
      occurredAt: params.occurredAt ?? new Date(),
      metadata: params.metadata,
    });
  } catch (err) {
    log.warn('external_click_sync_failed', { error: String(err) });
  }
}
