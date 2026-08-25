// GET/PUT/DELETE /api/billing/subscription
// Gestion d'abonnement — accés utilisateur authentifié
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';
import { PLANS, CREDIT_PACKAGES, type PlanTier } from '@/lib/billing/plans';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
const log = createLogger('billing-subscription');

// ============================================================
// GET — Récupérer l'abonnement et les infos billing de l'utilisateur
// ============================================================
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;

  try {
    const [user, subscription, lastTx] = await Promise.all([
      db.user.findUnique({ where: { id: auth.userId }, select: ['id', 'plan', 'email', 'name'] }),
      db.subscription.findFirst({
        where: [{ field: 'userId', op: '==', value: auth.userId }],
      }),
      db.creditTransaction.findFirst({
        where: [{ field: 'userId', op: '==', value: auth.userId }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
      }),
    ]);

    const plan = (user?.plan as PlanTier) || 'free';
    const planDef = PLANS.find(p => p.id === plan);
    const creditBalance = Number(lastTx?.balance) || 0;

    return NextResponse.json({
      subscription: {
        plan,
        status: subscription?.status || 'active',
        currentPeriodEnd: subscription?.currentPeriodEnd || null,
        cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,
      },
      currentPlan: planDef || null,
      credits: { balance: creditBalance },
    });
  } catch (err) {
    log.error('subscription_get_error', { error: String(err) });
    return NextResponse.json({ error: 'Erreur de chargement' }, { status: 500 });
  }
}

// ============================================================
// PUT — Changer de plan (initie un checkout Chariow)
// ============================================================
export async function PUT(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;

  try {
    const { planId } = await request.json();
    if (!planId) return NextResponse.json({ error: 'planId requis' }, { status: 400 });

    const plan = PLANS.find(p => p.id === planId);
    if (!plan) return NextResponse.json({ error: 'Plan invalide' }, { status: 400 });

    // Plan gratuit
    if (planId === 'free') {
      const existing = await db.subscription.findFirst({
        where: [{ field: 'userId', op: '==', value: auth.userId }],
      });
      if (existing?.id) {
        await db.subscription.update({
          where: { id: existing.id as string },
          data: { plan: 'free', status: 'canceled', cancelAtPeriodEnd: false },
        });
      }
      await db.user.update({ where: { id: auth.userId }, data: { plan: 'free' } });
      return NextResponse.json({ success: true, message: 'Basculé vers le plan Gratuit' });
    }

    // Initier un checkout Chariow
    const { chariow } = await import('@/lib/payment/chariow');
    if (!chariow.isConfigured()) {
      return NextResponse.json({ error: 'Paiement non disponible' }, { status: 503 });
    }

    const productId = process.env[`CHARIOW_PRODUCT_PLAN_${planId.toUpperCase()}`] || '';
    if (!productId) {
      return NextResponse.json({ error: 'Plan non configuré pour le paiement' }, { status: 503 });
    }

    const reference = `GEN3IA-${planId}-${auth.userId.slice(0, 8)}-${Date.now()}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gen3ia.online';

    const checkout = await chariow.initiateCheckout({
      productId,
      metadata: { userId: auth.userId, type: 'plan', planId, credits: String(plan.credits) },
      successUrl: `${baseUrl}/billing?checkout=success&plan=${planId}`,
      cancelUrl: `${baseUrl}/billing?checkout=cancelled`,
    });

    log.info('subscription_upgrade', { userId: auth.userId, plan: planId, saleId: checkout.saleId });

    return NextResponse.json({
      success: true,
      url: checkout.checkoutUrl,
      transactionId: checkout.saleId || reference,
      message: `Redirection vers le paiement pour le plan ${plan.name}...`,
    });
  } catch (err) {
    log.error('subscription_put_error', { error: String(err) });
    return NextResponse.json({ error: 'Erreur de mise à jour' }, { status: 500 });
  }
}

// ============================================================
// DELETE — Résilier l'abonnement (revenir au plan gratuit en fin de période)
// ============================================================
export async function DELETE(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;

  try {
    const existing = await db.subscription.findFirst({
      where: [{ field: 'userId', op: '==', value: auth.userId }],
    });

    if (existing?.id) {
      await db.subscription.update({
        where: { id: existing.id as string },
        data: { cancelAtPeriodEnd: true },
      });
    }

    log.info('subscription_cancelled', { userId: auth.userId });
    return NextResponse.json({ success: true, message: 'Abonnement résilié. Vous gardez votre plan jusqu\'à la fin de la période.' });
  } catch (err) {
    log.error('subscription_delete_error', { error: String(err) });
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}