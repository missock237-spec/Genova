import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getAIJobQueue } from '@/lib/queue';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    const queue = getAIJobQueue();

    if (jobId) {
      const status = await queue.getJobStatus(jobId);
      if (!status) {
        return secureResponse(
          NextResponse.json({ error: 'Job non trouvé' }, { status: 404 }),
          request
        );
      }
      return secureResponse(NextResponse.json(status), request);
    }

    const stats = await queue.getQueueStats();
    const health = await queue.healthCheck();

    return secureResponse(NextResponse.json({ stats, health }), request);
  } catch (err) {
    return secureResponse(
      NextResponse.json({ error: 'Erreur lors de la récupération du statut' }, { status: 500 }),
      request
    );
  }
}
