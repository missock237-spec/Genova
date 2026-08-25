// GET /api/billing/credits — Solde et historique des crédits
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;

  try {
    const [lastTx, history] = await Promise.all([
      db.creditTransaction.findFirst({
        where: [{ field: 'userId', op: '==', value: auth.userId }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
      }),
      db.creditTransaction.findMany({
        where: [{ field: 'userId', op: '==', value: auth.userId }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 50,
      }),
    ]);

    return NextResponse.json({
      balance: Number(lastTx?.balance) || 0,
      transactions: (history || []).map((tx: any) => ({
        id: tx.id,
        amount: tx.amount,
        balance: tx.balance,
        type: tx.type,
        description: tx.description,
        createdAt: tx.createdAt,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
