'use client';

// ============================================================
// AdBar — Barre publicitaire bottom-bar (thème Gen3ia)
// ------------------------------------------------------------
// Affiche une pub sponsorisée en bas de l'écran sur toutes les vues
// SAUF le chat (où ConversationAd est utilisé après chaque réponse).
// Les utilisateurs gratuits voient des pubs obligatoires (non récompensées).
// Les utilisateurs payants voient des pubs récompensées en crédits
// et peuvent les désactiver depuis Paramètres > Publicités.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { ExternalLink, Settings, X } from 'lucide-react';

interface AdCampaign {
  id: string;
  name: string;
  advertiserName: string;
  advertiserUrl: string;
  textContent: string;
  ctaText: string;
  ctaUrl: string;
}

interface AdDecision {
  shouldShow: boolean;
  adType: 'unrewarded' | 'rewarded';
  campaign: AdCampaign | null;
  reason: string;
  pendingRewardPerView: number;
  pendingRewardPerClick: number;
  isFreePlan: boolean;
  canDisableAds: boolean;
  variantId?: string;
  variantText?: string;
  variantCta?: string;
}

interface AdPreferences {
  adsEnabled: boolean;
  rewardedAdsEnabled: boolean;
  totalCreditsEarned: number;
  totalAdsViewed: number;
  isEligible: boolean;
  adType: 'unrewarded' | 'rewarded';
  mustShowInConversation: boolean;
  canDisableAds: boolean;
  isFreePlan: boolean;
}

interface AdBarProps {
  sessionId: string;
  conversationId?: string;
  placement?: string;
  /** Masquer la barre (ex: vue chat qui utilise ConversationAd) */
  hidden?: boolean;
  onAdClicked?: (rewarded: boolean, amount: number) => void;
}

/** Génère un ID de session court unique. */
function generateSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AdBar({ sessionId, conversationId, placement = 'bottom_bar', hidden = false, onAdClicked }: AdBarProps) {
  const [decision, setDecision] = useState<AdDecision | null>(null);
  const [preferences, setPreferences] = useState<AdPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [impressionId, setImpressionId] = useState<string | null>(null);
  const [rewardFlash, setRewardFlash] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const stableSessionId = useRef(sessionId || generateSessionId()).current;

  // Animation du flash de récompense
  useEffect(() => {
    if (rewardFlash === null) return;
    const t = setTimeout(() => setRewardFlash(null), 3000);
    return () => clearTimeout(t);
  }, [rewardFlash]);

  const fetchAd = useCallback(
    async (adType: 'unrewarded' | 'rewarded') => {
      try {
        const params = new URLSearchParams({
          scope: 'decide', sessionId: stableSessionId, placement,
        });
        if (conversationId) params.set('conversationId', conversationId);
        const res = await fetch(`/api/ads?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) { setLoading(false); return; }
        const data = await res.json();
        const dec: AdDecision | null = data?.decision ?? null;
        setDecision(dec);
        if (dec?.shouldShow && dec.campaign) {
          try {
            const impRes = await fetch('/api/ads?action=impression', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                campaignId: dec.campaign.id, adType,
                sessionId: stableSessionId, conversationId,
              }),
            });
            if (impRes.ok) {
              const impData = await impRes.json();
              const imp = impData?.impression;
              if (imp?.impressionId) setImpressionId(imp.impressionId);
              if (imp?.rewardCredited && Number(imp?.rewardAmount ?? 0) > 0) {
                setRewardFlash(Number(imp.rewardAmount));
              }
            }
          } catch { /* non-fatal */ }
        }
        setLoading(false);
      } catch { setLoading(false); }
    },
    [stableSessionId, conversationId, placement],
  );

  const loadPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/ads?scope=preferences', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const prefs: AdPreferences = data?.preferences;
        setPreferences(prefs);
        if (prefs?.adsEnabled) {
          await fetchAd(prefs.adType);
        } else { setLoading(false); }
      } else { setLoading(false); }
    } catch { setLoading(false); }
  }, [fetchAd]);

  useEffect(() => { void loadPreferences(); }, [loadPreferences]);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!impressionId || !decision?.campaign) return;
    const ctaUrl = decision.campaign.ctaUrl || decision.campaign.advertiserUrl;
    const safeUrl = ctaUrl.startsWith('http') ? ctaUrl : `https://${ctaUrl}`;
    try {
      const res = await fetch('/api/ads?action=click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ impressionId }),
      });
      if (res.ok) {
        const data = await res.json();
        const click = data?.click;
        if (click?.rewardCredited && Number(click?.rewardAmount ?? 0) > 0) {
          setRewardFlash(Number(click.rewardAmount));
          onAdClicked?.(true, Number(click.rewardAmount));
        }
      }
    } catch { /* non-fatal */ }
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  }, [impressionId, decision, onAdClicked]);

  if (hidden || dismissed || loading || !decision || !decision.shouldShow || !decision.campaign) {
    return null;
  }

  const { campaign, isFreePlan, canDisableAds } = decision;
  const adText = decision.variantText || campaign.textContent || campaign.name;
  const ctaLabel = decision.variantCta || campaign.ctaText || 'En savoir plus';

  return (
    <>
      {/* Flash de récompense animé */}
      {rewardFlash !== null && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 shadow-lg shadow-emerald-500/10">
            <span className="text-emerald-400 text-xs font-semibold">
              +{rewardFlash} crédit{rewardFlash > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Barre publicitaire principale */}
      <div
        role="complementary"
        aria-label="Publicité sponsorisée"
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-2.5 px-4 py-2 border-t bg-[#0D0E10]/95 backdrop-blur-md"
        style={{ borderColor: 'rgba(0, 245, 255, 0.08)' }}
      >
        {/* Badge Sponsorisé */}
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-widest text-[#5A6068]">
          Sponsorisé
        </span>

        {/* Séparateur */}
        <span className="shrink-0 w-px h-3.5 bg-[#1C1E22]" />

        {/* Contenu de la pub */}
        <button
          type="button"
          onClick={handleClick}
          className="flex-1 min-w-0 flex items-center gap-2 text-left group cursor-pointer"
        >
          <span className="truncate text-[13px] text-[#C0C4CC] group-hover:text-[#E6E8EC] transition-colors">
            {adText}
          </span>
          <span className="shrink-0 text-[13px] text-[#5A6068]">
            — {campaign.advertiserName}
          </span>
          <span className="shrink-0 inline-flex items-center gap-1 text-[13px] font-semibold text-[#00F5FF] group-hover:text-[#33f7ff] transition-colors whitespace-nowrap">
            {ctaLabel}
            <ExternalLink size={11} className="opacity-60" />
          </span>
        </button>

        {/* Indicateur de récompense (users payants) */}
        {!isFreePlan && preferences?.rewardedAdsEnabled && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 whitespace-nowrap">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-emerald-400">
              <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <text x="5" y="7" textAnchor="middle" fontSize="6" fill="currentColor" fontWeight="bold">$</text>
            </svg>
            crédits
          </span>
        )}

        {/* Badge non-supprimable (utilisateurs gratuits) */}
        {isFreePlan && (
          <span className="shrink-0 text-[9px] font-medium text-amber-500/70 bg-amber-500/8 border border-amber-500/15 rounded px-1.5 py-0.5 whitespace-nowrap">
            Plan Gratuit
          </span>
        )}

        {/* Bouton fermer + settings (users payants uniquement) */}
        {canDisableAds && (
          <div className="flex items-center gap-1 shrink-0">
            <a
              href="/settings"
              onClick={(e) => e.stopPropagation()}
              className="p-1 text-[#5A6068] hover:text-[#8A9099] transition-colors"
              title="Paramètres des publicités"
            >
              <Settings size={13} />
            </a>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
              className="p-1 text-[#5A6068] hover:text-[#8A9099] transition-colors"
              title="Masquer pour cette session"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
