import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/get-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'overview';

    if (scope === 'overview') {
      // Return basic authenticated user info as overview
      return NextResponse.json({
        success: true,
        userId: auth.uid,
        scope: 'overview',
      });
    }

    return NextResponse.json({ error: 'Scope invalide' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
