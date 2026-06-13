import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { applySecurity, secureResponse } from '@/lib/security';
import { FileValidator } from '@/lib/security/file-validator';
import { apiError, apiResponse } from '@/lib/server-api';

export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { requireAuth: true });
    if (error || !auth) return error || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const engine = getAgentEngine();
    const documents = await engine.ragRetriever.getDocuments(auth.userId);

    return secureResponse(NextResponse.json({ documents }), request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { requireAuth: true });
    if (error || !auth) return error || apiError('Auth required', 401, request);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError('No file provided', 400, request);
    }

    // Security: Validate file
    const validator = new FileValidator();
    const validation = validator.validateDocument({
      name: file.name,
      size: file.size,
      type: file.type,
    });

    if (!validation.allowed) {
      return apiError(`Invalid document: ${validation.reason}`, 400, request);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const engine = getAgentEngine();

    // Offload to worker via job queue
    const jobId = engine.jobQueue.enqueue('document_processing', {
      buffer,
      fileName: file.name,
      mimeType: file.type,
      userId: auth.userId,
    });

    return apiResponse({
      success: true,
      jobId,
      message: 'Document en cours de traitement',
    }, 202, request);

  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Upload failed', 500, request);
  }
}
