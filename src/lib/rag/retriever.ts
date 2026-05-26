// RAG Retriever — Context retrieval for augmented generation

import { db } from '@/lib/db';
import { findMostRelevant } from '@/lib/memory/embeddings';
import type { DocumentChunk } from './document-processor';

export class RAGRetriever {
  /**
   * Store document chunks in the database
   */
  async storeChunks(chunks: DocumentChunk[], userId: string): Promise<void> {
    // Find or create document
    const fileName = chunks[0]?.metadata.fileName;
    if (!fileName) return;

    // Get existing document or create one
    const existingDoc = await db.document.findFirst({
      where: { fileName, userId },
    });

    const documentId = existingDoc?.id || (
      await db.document.create({
        data: {
          fileName,
          fileType: fileName.split('.').pop() || 'unknown',
          fileSize: chunks.reduce((sum, c) => sum + c.content.length, 0),
          content: chunks.map(c => c.content).join('\n\n'),
          status: 'ready',
          userId,
        },
      })
    ).id;

    // Store chunks
    for (const chunk of chunks) {
      await db.documentChunk.create({
        data: {
          content: chunk.content,
          chunkIndex: chunk.metadata.chunkIndex,
          pageNumber: chunk.metadata.pageNumber,
          metadata: JSON.stringify(chunk.metadata),
          documentId,
          userId,
        },
      });
    }

    // Update document status
    await db.document.update({
      where: { id: documentId },
      data: { status: 'ready' },
    });
  }

  /**
   * Retrieve relevant chunks for a query
   */
  async retrieve(
    query: string,
    userId: string,
    topK: number = 5
  ): Promise<Array<{ content: string; source: string; score: number }>> {
    const chunks = await db.documentChunk.findMany({
      where: { userId },
      include: { document: { select: { fileName: true } } },
    });

    if (chunks.length === 0) return [];

    const documents = chunks.map(c => ({
      content: c.content,
      id: c.id,
      source: c.document.fileName,
    }));

    const relevant = findMostRelevant(query, documents, topK);

    return relevant.map(r => ({
      content: r.document.content,
      source: r.document.source as string,
      score: r.score,
    }));
  }

  /**
   * Build a RAG-augmented prompt
   */
  async augmentPrompt(
    query: string,
    userId: string,
    systemPrompt: string
  ): Promise<string> {
    const relevantChunks = await this.retrieve(query, userId, 3);

    if (relevantChunks.length === 0) return systemPrompt;

    const contextSection = relevantChunks
      .map((chunk, i) => `[Source ${i + 1}: ${chunk.source}]\n${chunk.content}`)
      .join('\n\n---\n\n');

    return `${systemPrompt}\n\n## Contexte extrait des documents\n\n${contextSection}\n\nUtilise ces informations pour répondre à la question de l'utilisateur quand c'est pertinent.`;
  }

  /**
   * Get all documents for a user with chunk counts
   */
  async getDocuments(userId: string): Promise<Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    status: string;
    chunkCount: number;
    createdAt: string;
  }>> {
    const documents = await db.document.findMany({
      where: { userId },
      include: { chunks: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return documents.map(d => ({
      id: d.id,
      fileName: d.fileName,
      fileType: d.fileType,
      fileSize: d.fileSize,
      status: d.status,
      chunkCount: d.chunks.length,
      createdAt: d.createdAt.toISOString(),
    }));
  }
}
