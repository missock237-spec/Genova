import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { matchSkillsForAgent, AGENT_TYPES, getAgentTypesByCategory } from '@/lib/skills-sh';
import { rateLimit } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

/**
 * POST /api/skills/discover
 * 
 * Given an agent type ID and system prompt, returns the best matching skills
 * from both local catalog and skills.sh ecosystem.
 * 
 * Body: { agentTypeId: string, systemPrompt: string }
 */
export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth)
    return (
      secError ||
      NextResponse.json({ error: 'Auth required' }, { status: 401 })
    );

  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed)
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  try {
    const body = await request.json();
    const { agentTypeId, systemPrompt } = body;

    if (!agentTypeId || !systemPrompt) {
      return NextResponse.json(
        { error: 'agentTypeId and systemPrompt are required' },
        { status: 400 }
      );
    }

    // Validate agent type
    const typeDef = AGENT_TYPES.find((t) => t.id === agentTypeId);
    if (!typeDef) {
      return NextResponse.json(
        { error: `Unknown agent type: ${agentTypeId}` },
        { status: 400 }
      );
    }

    // Sanitize prompt length
    const sanitizedPrompt =
      typeof systemPrompt === 'string'
        ? systemPrompt.substring(0, 2000)
        : '';

    const result = await matchSkillsForAgent({
      agentTypeId,
      systemPrompt: sanitizedPrompt,
    });

    return secureResponse(NextResponse.json(result), request);
  } catch (err) {
    console.error(
      '[skills/discover/POST] Error:',
      err instanceof Error ? err.message : err
    );
    const res = NextResponse.json(
      { error: 'Skill discovery failed' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

/**
 * GET /api/skills/discover
 * Returns the catalog of agent types with their skill mappings.
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

  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed)
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  const typesByCategory = getAgentTypesByCategory();

  // Return agent types without the full system prompts (too verbose for catalog)
  const catalog = Object.entries(typesByCategory).map(
    ([category, types]) => ({
      category,
      types: types.map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
        icon: t.icon,
        color: t.color,
        bgColor: t.bgColor,
        localSkills: t.localSkills,
        recommendedModel: t.recommendedModel,
        recommendedTemperature: t.recommendedTemperature,
      })),
    })
  );

  const res = NextResponse.json({ catalog });
  return secureResponse(res, request);
}
