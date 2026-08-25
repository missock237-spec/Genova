// POST /api/billing/purchase-credits — Achat de crédits via Chariow
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { chariow } from '@/lib/payment/chariow';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
const log = createLogger('purchase-credits');

const CREDIT_PACKS: Record<string, { credits: number; name: string }> = {
  credits_100:  { credits: 100,  name: '100 crédits' },
  credits_500:  { credits: 500,  name: '500 crédits' },
  credits_2000: { credits: 2000, name: '2 000 crédits' },
  credits_5000: { credits: 5000, name: '5 000 crédits' },
};

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;

  try {
    const { packId, phone, operator } = await request.json();
    if (!packId) return NextResponse.json({ error: 'packId requis' }, { status: 400 });

    const pack = CREDIT_PACKS[packId];
    if (!pack) return NextResponse.json({ error: 'Pack invalide' }, { status: 400 });

    if (!chariow.isConfigured()) {
      return NextResponse.json({ error: 'Paiement non disponible' }, { status: 503 });
    }

    const productId = process.env[`CHARIOW_PRODUCT_CREDITS_${packId.toUpperCase()}`] || '';
    if (!productId) {
      return NextResponse.json({ error: 'Pack non configuré pour le paiement' }, { status: 503 });
    }

    const reference = `GEN3IA_CRED_${auth.userId.slice(0, 8)}_${Date.now()}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gen3ia.online';

    const metadata: Record<string, string> = {
      userId: auth.userId,
      type: 'credits',
      credits: String(pack.credits),
      packId,
    };
    if (phone) metadata.phone = phone;
    if (operator) metadata.operator = operator;

    const checkout = await chariow.initiateCheckout({
      productId,
      metadata,
      successUrl: `${baseUrl}/billing?checkout=success&credits=${pack.credits}&ref=${reference}`,
      cancelUrl: `${baseUrl}/billing?checkout=cancelled`,
    });

    // Enregistrer la transaction en attente
    await db.creditTransaction.create({
      data: {
        userId: auth.userId,
        type: 'pending',
        amount: pack.credits,
        description: `${pack.name} - En attente Chariow`,
        reference,
      },
    });

    log.info('purchase_credits_initiated', { userId: auth.userId, pack: packId, saleId: checkout.saleId });

    return NextResponse.json({
      success: true,
      url: checkout.checkoutUrl,
      transactionId: checkout.saleId || reference,
      reference,
      message: `Paiement de ${pack.name} initié. Redirection vers Chariow...`,
    });
  } catch (err) {
    log.error('purchase_credits_error', { error: String(err) });
    return NextResponse.json({ error: 'Erreur de paiement' }, { status: 500 });
  }
}
