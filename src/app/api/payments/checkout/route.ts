// ============================================================
// POST /api/payments/checkout — Initie un paiement via Chariow
// Supporte: Orange Money, MTN MoMo, Wave, Carte (via Chariow)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';
import { chariow } from '@/lib/payment/chariow';
import { createLogger } from '@/lib/logger';

export const dynamic = "force-dynamic";
const log = createLogger('checkout');

// productId = identifiant du produit Chariow correspondant à chaque plan
const PLAN_PRODUCTS: Record<string, { credits: number; name: string; productId: string }> = {
  free: { credits: 100, name: 'Gratuit', productId: process.env.CHARIOW_PRODUCT_PLAN_FREE || '' },
  starter: { credits: 1000, name: 'Starter', productId: process.env.CHARIOW_PRODUCT_PLAN_STARTER || '' },
  pro: { credits: 5000, name: 'Pro', productId: process.env.CHARIOW_PRODUCT_PLAN_PRO || '' },
  enterprise: { credits: 25000, name: 'Enterprise', productId: process.env.CHARIOW_PRODUCT_PLAN_ENTERPRISE || '' },
};

const CREDIT_PACKS: Record<string, { credits: number; productId: string; name: string }> = {
  small: { credits: 500, name: 'Pack 500 crédits', productId: process.env.CHARIOW_PRODUCT_CREDITS_SMALL || '' },
  medium: { credits: 2000, name: 'Pack 2000 crédits', productId: process.env.CHARIOW_PRODUCT_CREDITS_MEDIUM || '' },
  large: { credits: 5000, name: 'Pack 5000 crédits', productId: process.env.CHARIOW_PRODUCT_CREDITS_LARGE || '' },
  xlarge: { credits: 15000, name: 'Pack 15000 crédits', productId: process.env.CHARIOW_PRODUCT_CREDITS_XLARGE || '' },
};

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;
  try {
    const { type, id, phone } = await request.json();

    if (!type || !id) {
      return NextResponse.json({ error: 'Type et ID requis' }, { status: 400 });
    }

    if (!chariow.isConfigured()) {
      return NextResponse.json({ error: 'Chariow non configuré' }, { status: 503 });
    }

    // === ACHAT DE PLAN ===
    if (type === 'plan') {
      const plan = PLAN_PRODUCTS[id];
      if (!plan) {
        return NextResponse.json({ error: 'Plan invalide' }, { status: 400 });
      }

      // Plan gratuit - activation directe
      if (id === 'free') {
        await db.user.update({ where: { id: auth.userId }, data: { plan: 'free' } });
        await db.creditTransaction.create({
          data: { userId: auth.userId, type: 'bonus', amount: plan.credits, description: `Plan ${plan.name} activé` },
        });
        return NextResponse.json({ success: true, message: `Plan ${plan.name} activé !` });
      }

      if (!plan.productId) {
        return NextResponse.json({ error: 'Produit Chariow non configuré pour ce plan' }, { status: 503 });
      }

      const reference = `gen3ia_${auth.userId.slice(0, 8)}_${Date.now()}`;
      const metadata: Record<string, string> = { userId: auth.userId, type: 'plan', planId: id, credits: String(plan.credits) };
      if (phone) metadata.phone = phone;

      const checkout = await chariow.initiateCheckout({
        productId: plan.productId,
        metadata,
        successUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/billing?checkout=plan_${id}&ref=${reference}`,
        cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/billing`,
      });

      log.info('checkout_plan_initiated', { userId: auth.userId, plan: id, saleId: checkout.saleId });

      return NextResponse.json({
        url: checkout.checkoutUrl || `/billing?checkout=plan_${id}&ref=${reference}`,
        transactionId: checkout.saleId || reference,
        reference,
        success: true,
        message: checkout.step === 'payment'
          ? `Paiement de votre ${plan.name} initié. Redirection vers Chariow...`
          : 'Votre plan a été activé.',
      });
    }

    // === ACHAT DE CRÉDITS ===
    if (type === 'credits') {
      const pack = CREDIT_PACKS[id];
      if (!pack) {
        return NextResponse.json({ error: 'Pack de crédits invalide' }, { status: 400 });
      }
      if (!pack.productId) {
        return NextResponse.json({ error: 'Produit Chariow non configuré pour ce pack' }, { status: 503 });
      }

      const reference = `gen3ia_cred_${auth.userId.slice(0, 8)}_${Date.now()}`;
      const metadata: Record<string, string> = { userId: auth.userId, type: 'credits', credits: String(pack.credits) };
      if (phone) metadata.phone = phone;

      const checkout = await chariow.initiateCheckout({
        productId: pack.productId,
        metadata,
        successUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/billing?checkout=credits_${id}&ref=${reference}`,
        cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/billing`,
      });

      await db.creditTransaction.create({
        data: {
          userId: auth.userId,
          type: 'pending',
          amount: pack.credits,
          description: `${pack.name} - En attente de confirmation Chariow`,
          reference,
        },
      });

      log.info('checkout_credits_initiated', { userId: auth.userId, pack: id, saleId: checkout.saleId });

      return NextResponse.json({
        url: checkout.checkoutUrl || `/billing?checkout=credits_${id}&ref=${reference}`,
        transactionId: checkout.saleId || reference,
        reference,
        success: true,
        message: `Paiement de ${pack.name} initié. Redirection vers Chariow...`,
      });
    }

    return NextResponse.json({ error: 'Type de transaction invalide' }, { status: 400 });
  } catch (error) {
    log.error('checkout_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de paiement' }, { status: 500 });
  }
}
