// Knowledge API Route — CRUD for knowledge entries

import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const category = searchParams.get('category');

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const engine = getAgentEngine();
    const entries = await engine.longTermMemory.getAll(userId, category || undefined);

    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, category, tags, source, relevance, userId } = body;

    if (!content || !userId) {
      return NextResponse.json({ error: 'content et userId requis' }, { status: 400 });
    }

    const engine = getAgentEngine();
    const id = await engine.longTermMemory.store({
      content,
      category: category || 'project',
      tags: tags || [],
      source: source || 'manual',
      relevance: relevance || 0.5,
      userId,
    });

    return NextResponse.json({ id, success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    const engine = getAgentEngine();
    await engine.longTermMemory.delete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
