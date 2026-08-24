import { NextResponse } from 'next/server';
import { adBillingScheduler } from '@/services/ad-billing-scheduler';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
// @ts-ignore — type narrowing pending, voir le pattern /api/cron/refresh-tokens
    const authHeader = (await import('next/headers')).headers().then(h => h.get('authorization'));
    const expectedToken = process.env.CRON_SECRET;
    const actualToken = (await authHeader)?.replace('Bearer ', '');
    if (expectedToken && actualToken !== expectedToken) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    const result = await adBillingScheduler.run();

    return NextResponse.json({
      success: true,
      message: 'Facturation publicitaire et sync externe terminees',
      externalSync: result.externalSync,
      invoices: result.invoices,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('CRON /advertising-billing error:', error);
    return NextResponse.json({ error: 'Erreur cron' }, { status: 500 });
  }
}
