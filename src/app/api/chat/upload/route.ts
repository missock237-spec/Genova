/**
 * API Route: /api/chat/upload
 * POST: Upload file(s) for chat attachments (images, videos, documents)
 * Returns signed URLs for each uploaded file.
 */

import { NextRequest, NextResponse } from 'next/server';
import { uploadFile, validateFile } from '@/lib/upload';
import { applySecurity } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new Response(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 15, windowMs: 60000 },
  });
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    if (files.length > 5) {
      return NextResponse.json({ error: 'Maximum 5 fichiers par envoi' }, { status: 400 });
    }

    const results = await Promise.allSettled(
      files.map(async (file) => {
        // Validate
        const validation = validateFile(file);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        const result = await uploadFile(file, 'chat-attachments', {
          public: true,
          ownerUid: auth.userId,
          metadata: {
            uploadedVia: 'chat',
            userId: auth.userId,
          },
        });

        return {
          url: result.publicUrl || result.url,
          filename: result.originalName,
          mimeType: result.mimeType,
          size: result.size,
          category: result.category,
        };
      }),
    );

    const uploaded: Array<{ url: string; filename: string; mimeType: string; size: number; category: string }> = [];
    const errors: string[] = [];

    for (const r of results) {
      if (r.status === 'fulfilled') {
        uploaded.push(r.value);
      } else {
        errors.push(r.reason?.message || 'Erreur inconnue');
      }
    }

    return NextResponse.json({
      files: uploaded,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
