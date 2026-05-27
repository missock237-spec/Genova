// RAG Retriever — Advanced context retrieval with hybrid search
// Combines BM25 + Semantic embeddings + Reranking for production-quality RAG

import { db } from '@/lib/db';
import {
  hybridSearch,
  rerankResults,
  generateEmbedding,
  storeEmbedding,
  searchSimilar,
  type BM25Document,
  type HybridSearchResult,
} from '@/lib/memory/embeddings';
import type { DocumentChunk } from './document-processor';

export class RAGRetriever {
  /**
   * Store document chunks in the database and index them for search
   */
  async storeChunks(chunks: DocumentChunk[], userId: string): Promise<void> {
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
          status: 'processing',
          userId,
        },
      })
    ).id;

    // Store chunks and generate embeddings
    for (const chunk of chunks) {
      const savedChunk = await db.documentChunk.create({
        data: {
          content: chunk.content,
          chunkIndex: chunk.metadata.chunkIndex,
          pageNumber: chunk.metadata.pageNumber,
          metadata: JSON.stringify(chunk.metadata),
          documentId,
          userId,
        },
      });

      // Generate and store embedding for this chunk
      try {
        const embedding = await generateEmbedding(chunk.content);
        storeEmbedding(savedChunk.id, chunk.content, embedding, {
          documentId,
          fileName,
          chunkIndex: chunk.metadata.chunkIndex,
          userId,
        });
      } catch {
        // If embedding generation fails, chunk is still stored for BM25/TF-IDF search
      }
    }

    // Update document status
    await db.document.update({
      where: { id: documentId },
      data: { status: 'ready' },
    });
  }

  /**
   * Retrieve relevant chunks using hybrid search (BM25 + Semantic + Reranking)
   */
  async retrieve(
    query: string,
    userId: string,
    options: {
      topK?: number;
      useReranking?: boolean;
      semanticWeight?: number;
      bm25Weight?: number;
      documentId?: string;
    } = {}
  ): Promise<Array<{ content: string; source: string; score: number; semanticScore: number; bm25Score: number }>> {
    const {
      topK = 5,
      useReranking = true,
      semanticWeight = 0.6,
      bm25Weight = 0.4,
      documentId,
    } = options;

    // Fetch chunks from database
    const where: Record<string, unknown> = { userId };
    if (documentId) where.documentId = documentId;

    const chunks = await db.documentChunk.findMany({
      where,
      include: { document: { select: { fileName: true } } },
    });

    if (chunks.length === 0) return [];

    // Convert to BM25 documents for hybrid search
    const documents: BM25Document[] = chunks.map(c => ({
      id: c.id,
      content: c.content,
      metadata: {
        source: c.document.fileName,
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
      },
    }));

    // Run hybrid search
    const results = await hybridSearch(query, documents, {
      topK,
      semanticWeight,
      bm25Weight,
      useReranking,
      userId,
    });

    return results.map(r => ({
      content: r.content,
      source: (r.metadata?.source as string) || 'Document inconnu',
      score: r.score,
      semanticScore: r.semanticScore,
      bm25Score: r.bm25Score,
    }));
  }

  /**
   * Build a RAG-augmented prompt with source citations
   */
  async augmentPrompt(
    query: string,
    userId: string,
    systemPrompt: string,
    options: {
      topK?: number;
      useReranking?: boolean;
      maxContextLength?: number;
    } = {}
  ): Promise<string> {
    const { topK = 5, useReranking = true, maxContextLength = 4000 } = options;

    const relevantChunks = await this.retrieve(query, userId, { topK, useReranking });

    if (relevantChunks.length === 0) return systemPrompt;

    // Build context with citations, respecting max length
    let contextSection = '';
    let currentLength = 0;

    for (let i = 0; i < relevantChunks.length; i++) {
      const chunk = relevantChunks[i];
      const entry = `[Source ${i + 1}: ${chunk.source} (pertinence: ${(chunk.score * 100).toFixed(0)}%)]\n${chunk.content}\n`;

      if (currentLength + entry.length > maxContextLength) break;
      contextSection += entry + '\n---\n\n';
      currentLength += entry.length;
    }

    return `${systemPrompt}

## Contexte extrait des documents de connaissance
Les informations suivantes proviennent de la base de connaissances et doivent être utilisées pour répondre à la question de l'utilisateur quand c'est pertinent. Cite les sources quand tu utilises ces informations.

${contextSection}

Instructions:
- Utilise ces informations en priorité pour répondre à la question
- Cite les sources entre crochets [Source X] quand tu utilises une information
- Si les informations ne suffisent pas, indique-le clairement
- Ne pas inventer d'informations qui ne sont pas dans les sources`;
  }

  /**
   * Get all documents for a user with chunk counts and embedding status
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

  /**
   * Delete a document and all its chunks and embeddings
   */
  async deleteDocument(documentId: string): Promise<void> {
    // Get chunks to clean up embeddings
    const chunks = await db.documentChunk.findMany({
      where: { documentId },
      select: { id: true },
    });

    // Delete chunks from database
    await db.documentChunk.deleteMany({
      where: { documentId },
    });

    // Delete document
    await db.document.delete({
      where: { id: documentId },
    });

    // Note: Embeddings in vector store will be cleaned up on restart
    // or can be cleaned via clearVectorStore()
  }
}
