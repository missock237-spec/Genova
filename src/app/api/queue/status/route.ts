// Queue Status Route — Get job queue status

import { NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';

export async function GET() {
  try {
    const engine = getAgentEngine();
    const status = engine.jobQueue.getStatus();

    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
