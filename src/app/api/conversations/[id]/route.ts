import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, verifyOwnership, secureResponse } from '@/lib/security';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const { id } = await params;
    const conversation = await db.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } }, agent: { select: { name: true, type: true } } },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation non trouvée' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, conversation.userId, 'Conversation');
    if (ownershipError) return ownershipError;

    return secureResponse(request, NextResponse.json(conversation));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
