import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { searchSkills, listSkills, getCuratedSkills } from '@/lib/skills-sh';
import { rateLimit } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

/**
 * GET /api/skills/sh?q=...&view=trending&limit=20
 * 
 * Proxy to skills.sh API for the frontend.
 * - ?q=search  → Search skills
 * - ?view=trending|hot|all-time  → List leaderboard
 * - ?curated=true  → Get curated skills
 */
export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth)
    return (
      secError ||
      NextResponse.json({ error: 'Auth required' }, { status: 401 })
    );

  // Rate limit
  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed)
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const view = (searchParams.get('view') as 'trending' | 'hot' | 'all-time') || 'trending';
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 200);
    const curated = searchParams.get('curated') === 'true';

    if (curated) {
      const result = await getCuratedSkills();
      return secureResponse(NextResponse.json(result), request);
    }

    if (query) {
      const result = await searchSkills(query, limit);
      return secureResponse(NextResponse.json(result), request);
    }

    const result = await listSkills(view, 0, limit);
    return secureResponse(NextResponse.json(result), request);
  } catch (err) {
    console.error(
      '[skills/sh/GET] Error:',
      err instanceof Error ? err.message : err
    );
    const res = NextResponse.json(
      {
        error: 'Failed to fetch skills from skills.sh',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 502 }
    );
    return secureResponse(res, request);
  }
}
