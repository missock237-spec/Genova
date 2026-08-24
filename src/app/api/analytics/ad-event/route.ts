// API de tracking des événements publicitaires
// SECURITE: POST = user authentifié (logique), GET stats = admin uniquement
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
const log = createLogger('ad-event');

interface AdEvent {
  adId: string;
  type: 'view' | 'click' | 'dismiss';
  timestamp: string;
  plan: string;
}

// Cache léger en mémoire pour le cooldown (seconde-resolu)
const cooldownMap: Map<string, number> = new Map();

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

// Compter les rewards du jour pour un utilisateur (DB)
async function getDailyRewardCount(userId: string): Promise<number> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const count = await db.adReward.count({
      where: [
        { field: 'userId', op: '==', value: userId },
        { field: 'createdAt', op: '>=', value: todayStart.toISOString() },
      ],
    });
    return count as number;
  } catch {
    return 0;
  }
}

// POST — Tracking des events (utilisateur authentifié)
export const POST = withAuth(async (request: NextRequest, _ctx: { params?: Promise<any> }, auth) => {
  try {
    const body = await request.json();
    const events: AdEvent[] = body.events || [body];
    const isSync = body.sync === true;

    const results = [];

    for (const event of events) {
      const { adId, type, timestamp, plan } = event;

      if (!adId || !type || !plan) {
        results.push({ adId, status: 'ignored', reason: 'Données incomplètes' });
        continue;
      }

      if (plan !== 'free' && (type === 'view' || type === 'click')) {
        const now = Date.now();
        const cooldownKey = `cooldown_${auth.userId}_${adId}`;
        const lastReward = cooldownMap.get(cooldownKey) || 0;

        // Anti-abuse : cooldown 30s
        const elapsed = (now - lastReward) / 1000;
        if (elapsed < 30 && !isSync) {
          results.push({ adId, status: 'cooldown', reason: `Encore ${Math.ceil(30 - elapsed)}s` });
          continue;
        }

        // Anti-abuse : max 50/jour (vérifié en DB)
        const dailyCount = await getDailyRewardCount(auth.userId);
        if (dailyCount >= 50) {
          results.push({ adId, status: 'limit_reached', reason: 'Limite journalière atteinte (50/jour)' });
          continue;
        }

        const credits = type === 'click' ? 2 : 1;

        // Persister le reward en DB (fire-and-forget)
        db.adReward.create({
          data: {
            userId: auth.userId,
            adId,
            type,
            credits,
            plan,
          },
        }).catch((err) => {
          log.warn('Failed to persist ad reward', { userId: auth.userId, adId, error: String(err) });
        });

        // Créditer l'utilisateur
        db.user.update({
          where: { id: auth.userId },
          data: { credits: { increment: credits } },
        }).catch(() => {});

        // Mettre à jour le cooldown en mémoire
        cooldownMap.set(cooldownKey, now);

        results.push({
          adId,
          status: 'rewarded',
          credits,
          dailyCount: dailyCount + 1,
          message: `+${credits} crédit${credits > 1 ? 's' : ''}`,
        });
      } else {
        results.push({ adId, status: 'logged', plan });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Erreur serveur' },
      { status: 500 },
    );
  }
}, {
  requireAuth: true,
  rateLimit: { limit: 100, windowMs: 60000 },
});

// GET — Stats du dashboard (ADMIN UNIQUEMENT)
export const GET = withAuth(async (_request, _ctx, auth) => {
  // Seuls les admins peuvent voir les stats globales
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'Admin uniquement' }, { status: 403 });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayRewards = await db.adReward.count({
    where: [
      { field: 'createdAt', op: '>=', value: todayStart.toISOString() },
    ],
  });

  const totalRewards = await db.adReward.count({});

  return NextResponse.json({
    todayRewards,
    totalRewards,
    period: 'today',
  });
}, {
  requireAuth: true,
  rateLimit: { limit: 30, windowMs: 60000 },
});
