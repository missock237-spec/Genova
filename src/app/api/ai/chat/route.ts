import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message requis' }, { status: 400 });
    }

    const zai = await ZAI.create();

    const messages = [
      {
        role: 'system' as const,
        content: `Tu es l'assistant AgentOS, un IA qui aide les utilisateurs à contrôler leur système d'agents IA. Tu parles en français. Tu aides à comprendre les commandes en langage naturel et à les transformer en actions. Tu es concis et professionnel. Réponds toujours en français.`,
      },
      ...(history || []).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    const completion = await zai.chat.completions.create({
      messages,
    });

    const reply = completion.choices?.[0]?.message?.content || 'Désolé, je n\'ai pas pu traiter votre demande.';

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la communication avec l\'IA' }, { status: 500 });
  }
}
