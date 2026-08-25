// POST /api/billing/checkout — Initie un checkout Chariow pour un plan
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';
import { chariow } from '@/lib/payment/chariow';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
const log = createLogger('billing-checkout');

const PLAN_PRODUCTS: Record<string, { credits: number; name: string }> = {
  free:     { credits: 100,   name: 'Gratuit' },
  starter:  { credits: 1000,  name: 'Starter' },
  pro:      { credits: 5000,  name: 'Pro' },
  enterprise: { credits: 25000, name: 'Enterprise' },
};

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;

  try {
    const { planId } = await request.json();
    if (!planId) return NextResponse.json({ error: 'planId requis' }, { status: 400 });

    const plan = PLAN_PRODUCTS[planId];
    if (!plan) return NextResponse.json({ error: 'Plan invalide' }, { status: 400 });

    // Plan gratuit — activation directe
    if (planId === 'free') {
      await db.user.update({ where: { id: auth.userId }, data: { plan: 'free' } });
      await db.creditTransaction.create({
        data: { userId: auth.userId, type: 'bonus', amount: plan.credits, description: `Plan ${plan.name} activé` },
      });
      return NextResponse.json({ success: true, message: `Plan ${plan.name} activé !` });
    }

    if (!chariow.isConfigured()) {
      return NextResponse.json({ error: 'Chariow non configuré. Contactez l\'admin.' }, { status: 503 });
    }

    const productId = process.env[`CHARIOW_PRODUCT_PLAN_${planId.toUpperCase()}`] || '';
    if (!productId) {
      return NextResponse.json({ error: `Produit Chariow non configuré pour ${planId}. Contactez l\'admin.` }, { status: 503 });
    }

    const reference = `GEN3IA-${planId}-${auth.userId.slice(0, 8)}-${Date.now()}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gen3ia.online';

    const checkout = await chariow.initiateCheckout({
      productId,
      metadata: { userId: auth.userId, type: 'plan', planId, credits: String(plan.credits) },
      successUrl: `${baseUrl}/billing?checkout=success&plan=${planId}&ref=${reference}`,
      cancelUrl: `${baseUrl}/billing?checkout=cancelled`,
    });

    log.info('checkout_plan', { userId: auth.userId, plan: planId, saleId: checkout.saleId });

    return NextResponse.json({
      success: true,
      url: checkout.checkoutUrl,
      transactionId: checkout.saleId || reference,
      reference,
      message: checkout.step === 'payment'
        ? `Paiement ${plan.name} initié. Redirection vers Chariow...`
        : 'Plan activé avec succès.',
    });
  } catch (err) {
    log.error('checkout_error', { error: String(err) });
    return NextResponse.json({ error: 'Erreur de paiement' }, { status: 500 });
  }
}
