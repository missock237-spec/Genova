import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getUserStyle, updatePersonalization, getPersonalizedSystemPrompt, adaptResponse } from '@/lib/memory/ai-personalization';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'style';

    if (action === 'prompt') {
      const prompt = await getPersonalizedSystemPrompt(auth.userId);
      return secureResponse(NextResponse.json({ prompt }), request);
    }

    if (action === 'adapt') {
      const response = searchParams.get('response') || '';
      const adapted = await adaptResponse(auth.userId, response);
      return secureResponse(NextResponse.json(adapted), request);
    }

    // Default: return user style
    const style = await getUserStyle(auth.userId);
    return secureResponse(NextResponse.json(style), request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to get personalization' }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function PUT(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const style = await updatePersonalization(auth.userId, body);
    return secureResponse(NextResponse.json(style), request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to update personalization' }, { status: 500 });
    return secureResponse(res, request);
  }
}
