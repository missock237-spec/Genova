// RAG Upload Route — Upload documents for RAG processing

import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const userId = formData.get('userId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Fichier requis' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    // Validate file
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 10 Mo)' }, { status: 400 });
    }

    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
    ];
    const allowedExtensions = ['pdf', 'txt', 'md', 'csv', 'json'];

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(ext)) {
      return NextResponse.json({ error: `Type de fichier non supporté: ${ext}. Types acceptés: ${allowedExtensions.join(', ')}` }, { status: 400 });
    }

    const engine = getAgentEngine();

    // Create document record
    const document = await db.document.create({
      data: {
        fileName: file.name,
        fileType: ext,
        fileSize: file.size,
        status: 'processing',
        userId,
      },
    });

    try {
      // Read file buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Process the document
      const chunks = await engine.documentProcessor.processFile(buffer, file.name, file.type);

      // Store chunks
      for (const chunk of chunks) {
        await db.documentChunk.create({
          data: {
            content: chunk.content,
            chunkIndex: chunk.metadata.chunkIndex,
            pageNumber: chunk.metadata.pageNumber,
            metadata: JSON.stringify(chunk.metadata),
            documentId: document.id,
            userId,
          },
        });
      }

      // Update document status
      await db.document.update({
        where: { id: document.id },
        data: {
          status: 'ready',
          content: chunks.map(c => c.content).join('\n\n'),
        },
      });

      // Store in knowledge base as well
      const fullContent = chunks.map(c => c.content).join('\n');
      if (fullContent.length > 0) {
        await engine.longTermMemory.store({
          content: fullContent.length > 3000 ? fullContent.substring(0, 3000) + '...' : fullContent,
          category: 'document',
          tags: [ext, file.name.replace(/\.[^/.]+$/, '')],
          source: 'document',
          relevance: 0.8,
          userId,
        });
      }

      return NextResponse.json({
        id: document.id,
        fileName: file.name,
        chunkCount: chunks.length,
        status: 'ready',
      });
    } catch (processingError) {
      // Update document status to error
      await db.document.update({
        where: { id: document.id },
        data: { status: 'error' },
      });

      throw processingError;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors du traitement du document' },
      { status: 500 }
    );
  }
}
