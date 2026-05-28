import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, verifyOwnership, secureResponse } from '@/lib/security';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { requireAuth: true });
    if (error || !auth) return error || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { id } = await params;
    const conversation = await db.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!conversation) {
      return secureResponse(NextResponse.json({ error: 'Conversation non trouvée' }, { status: 404 }), request);
    }

    const ownershipError = verifyOwnership(auth.userId, conversation.userId, 'Conversation');
    if (ownershipError) return ownershipError;

    return secureResponse(NextResponse.json(conversation), request);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
