// API Ads — Moteur publicitaire (link-only, plan-aware)
// ------------------------------------------------------------
// Endpoints:
//   GET  /api/ads?scope=decide            -> decide which ad to serve
//   GET  /api/ads?scope=stats             -> user ad stats
//   GET  /api/ads?scope=preferences       -> user ad preferences (plan-aware)
//   GET  /api/ads?scope=campaigns         -> admin: list campaigns
//   GET  /api/ads?scope=campaign-stats&campaignId=...  -> admin: campaign stats
//   POST /api/ads?action=impression       -> record an impression
//   POST /api/ads?action=click            -> record a click
//   POST /api/ads?action=set-ads-enabled  -> toggle ads (paid only; free rejected)
//   POST /api/ads?action=set-rewarded     -> toggle rewards (paid only; free rejected)
//   POST /api/ads?action=sync-rewards     -> batch sync (internal)
// ------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { getAdEngine, type AdPlacement } from '@/lib/advertising/ad-engine';

export const dynamic = 'force-dynamic';
const adEngine = getAdEngine();

function authId(auth: { id?: string; userId?: string } | null): string {
  if (!auth) return '';
  return auth.id || auth.userId || '';
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'decide';
    const userId = authId(auth);

    switch (scope) {
      case 'decide': {
        const sessionId = url.searchParams.get('sessionId') || userId;
        const placement = (url.searchParams.get('placement') as AdPlacement | null) || undefined;
        const keywords = url.searchParams.get('keywords')?.split(',').filter(Boolean);
        const country = url.searchParams.get('country') || undefined;
        const decision = await adEngine.decideAd(userId, sessionId, undefined, {
          placement,
          keywords: keywords?.length ? keywords : undefined,
          country: country || undefined,
        });
        return NextResponse.json({ success: true, decision });
      }
      case 'stats': {
        const stats = await adEngine.getUserAdStats(userId);
        return NextResponse.json({ success: true, stats });
      }
      case 'preferences': {
        const prefs = await adEngine.getUserAdPreferences(userId);
        return NextResponse.json({ success: true, preferences: prefs });
      }
      case 'campaigns': {
        if (auth.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
        const campaigns = await prisma.adCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
        return NextResponse.json({ success: true, campaigns });
      }
      case 'campaign-stats': {
        const campaignId = url.searchParams.get('campaignId');
        if (!campaignId) return NextResponse.json({ error: 'campaignId requis' }, { status: 400 });
        const stats = await adEngine.getCampaignStats(campaignId);
        return NextResponse.json({ success: true, stats });
      }
      default:
        return NextResponse.json({ error: 'Scope inconnu' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'impression';
    const userId = authId(auth);

    switch (action) {
      case 'impression': {
        if (!body.campaignId) return NextResponse.json({ error: 'campaignId requis' }, { status: 400 });
        const result = await adEngine.recordImpression(
          userId,
          String(body.campaignId),
          (body.adType as 'unrewarded' | 'rewarded') || 'unrewarded',
          String(body.sessionId || userId),
          body.conversationId ? String(body.conversationId) : undefined
        );
        return NextResponse.json({ success: true, impression: result });
      }
      case 'click': {
        if (!body.impressionId) return NextResponse.json({ error: 'impressionId requis' }, { status: 400 });
        const result = await adEngine.recordClick(String(body.impressionId));
        return NextResponse.json({ success: true, click: result });
      }
      case 'set-ads-enabled': {
        if (typeof body.enabled !== 'boolean') {
          return NextResponse.json({ error: 'enabled requis (boolean)' }, { status: 400 });
        }
        try {
          await adEngine.setAdsEnabled(userId, body.enabled);
          return NextResponse.json({ success: true });
        } catch (err) {
          const msg = String((err as Error).message || err);
          if (msg === 'FREE_PLAN_CANNOT_DISABLE_ADS') {
            return NextResponse.json(
              { error: 'Le plan gratuit ne permet pas de désactiver les publicités.' },
              { status: 403 }
            );
          }
          throw err;
        }
      }
      case 'set-rewarded': {
        if (typeof body.enabled !== 'boolean') {
          return NextResponse.json({ error: 'enabled requis (boolean)' }, { status: 400 });
        }
        try {
          await adEngine.setRewardedAdsEnabled(userId, body.enabled);
          return NextResponse.json({ success: true });
        } catch (err) {
          const msg = String((err as Error).message || err);
          if (msg === 'FREE_PLAN_CANNOT_EARN_REWARDS') {
            return NextResponse.json(
              { error: 'Le plan gratuit ne permet pas de cumuler des récompenses.' },
              { status: 403 }
            );
          }
          if (msg === 'REWARDS_REQUIRE_ADS_ENABLED') {
            return NextResponse.json(
              { error: 'Les récompenses nécessitent que les publicités soient activées.' },
              { status: 409 }
            );
          }
          throw err;
        }
      }
      case 'sync-rewards': {
        const { events } = body;
        if (!events || !Array.isArray(events)) {
          return NextResponse.json({ error: 'events requis (array)' }, { status: 400 });
        }
        const results = await Promise.allSettled(
          events.map((e: { adId?: string; type?: string; credits?: number }) =>
            prisma.adImpression.create({
              data: {
                campaignId: String(e.adId),
                userId,
                sessionId: userId,
                adType: e.type === 'click' ? 'rewarded' : 'unrewarded',
                viewDurationMs: 0,
                wasClicked: e.type === 'click',
                rewardCredited: true,
                rewardAmount: Number(e.credits || 0),
              },
            })
          )
        );
        return NextResponse.json({
          success: true,
          synced: results.filter(r => r.status === 'fulfilled').length,
        });
      }
      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
