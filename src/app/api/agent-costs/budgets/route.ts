import { NextRequest, NextResponse } from 'next/server';
import { budgetGuard } from '@/lib/agent-costs';

// [client-01] Endpoint batch pour récupérer les budgets de N agents en un seul appel.
// Évite le pattern N+1 côté client (agent-cost-dashboard faisait N fetchs individuels).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const agentIdsRaw = searchParams.get('agentIds');

    if (!userId || !agentIdsRaw) {
      return NextResponse.json(
        { success: false, error: 'userId and agentIds parameters are required' },
        { status: 400 }
      );
    }

    const agentIds = agentIdsRaw.split(',').filter(Boolean).slice(0, 50);

    if (agentIds.length === 0) {
      return NextResponse.json({ success: true, budgets: {} });
    }

    // Fetch all budgets in parallel
    const results = await Promise.allSettled(
      agentIds.map(async (agentId) => {
        const budget = await budgetGuard.getBudget(agentId, userId);
        return { agentId, budget };
      })
    );

    const budgets: Record<string, Awaited<ReturnType<typeof budgetGuard.getBudget>>> = {};
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.budget) {
        budgets[r.value.agentId] = r.value.budget;
      }
    }

    return NextResponse.json({ success: true, budgets });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch budgets';
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
