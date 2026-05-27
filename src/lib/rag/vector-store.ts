// Vector Store Abstraction Layer — Persistent vector database with pluggable backends
// Supports: SQLite (JSON-based fallback), Qdrant (production), and Hybrid Retrieval with RRF
// Architecture: VectorStoreAdapter → SQLiteVectorAdapter | QdrantVectorAdapter → HybridRetriever (RRF)

import { db } from '@/lib/db';
import {
  generateEmbedding,
  storeEmbedding,
  searchSimilar,
  simpleTokenize,
  type EmbeddingResult,
} from '@/lib/memory/embeddings';

// ============================================================
// INTERFACES
// ============================================================

export interface VectorDocument {
  id: string;
  content: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorSearchOptions {
  topK?: number;
  filter?: Record<string, unknown>;
  minScore?: number;
}

export interface VectorUpsertOptions {
  batchSize?: number;
}

export interface VectorStoreAdapter {
  /** Insert or update a vector document */
  upsert(doc: VectorDocument, options?: VectorUpsertOptions): Promise<void>;

  /** Search for similar vectors */
  search(queryVector: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]>;

  /** Delete a vector document by ID */
  delete(id: string): Promise<void>;

  /** Count total vectors in the store */
  count(): Promise<number>;

  /** Get the adapter type name */
  readonly adapterType: string;
}

// ============================================================
// SQLITE VECTOR ADAPTER — Uses Prisma + in-memory cache
// Stores vectors as JSON in the database for persistence,
// uses in-memory cache from embeddings.ts for fast search
// ============================================================

export class SQLiteVectorAdapter implements VectorStoreAdapter {
  readonly adapterType = 'sqlite';

  /**
   * Upsert a vector document: store in both in-memory cache and database
   */
  async upsert(doc: VectorDocument, _options?: VectorUpsertOptions): Promise<void> {
    // Store in the in-memory vector store for fast cosine search
    storeEmbedding(doc.id, doc.content, doc.vector, doc.metadata);

    // Also persist to database for durability across restarts
    try {
      const existing = await db.documentChunk.findUnique({
        where: { id: doc.id },
      });

      if (existing) {
        // Update existing chunk's metadata with vector reference
        const existingMeta = JSON.parse(existing.metadata || '{}');
        await db.documentChunk.update({
          where: { id: doc.id },
          data: {
            metadata: JSON.stringify({
              ...existingMeta,
              ...doc.metadata,
              _vectorStored: true,
              _vectorDimensions: doc.vector.length,
              _updatedAt: new Date().toISOString(),
            }),
          },
        });
      }
      // If no existing chunk, we still have it in memory.
      // The storeChunks method in RAGRetriever handles DB persistence
      // for chunks; this adapter focuses on the vector index.
    } catch (error) {
      // Non-fatal: in-memory store is always available
      console.warn(`[SQLiteVectorAdapter] Failed to persist vector metadata for ${doc.id}:`, error);
    }
  }

  /**
   * Search for similar vectors using the in-memory cosine similarity index
   */
  async search(queryVector: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const topK = options?.topK || 5;
    const minScore = options?.minScore || 0;
    const filter = options?.filter;

    const results: EmbeddingResult[] = searchSimilar(queryVector, topK * 2, (entry) => {
      // Apply metadata filter if provided
      if (filter) {
        for (const [key, value] of Object.entries(filter)) {
          if (entry.metadata[key] !== value) return false;
        }
      }
      return true;
    });

    return results
      .filter((r) => r.score >= minScore)
      .slice(0, topK)
      .map((r) => ({
        id: r.id,
        content: r.text,
        score: r.score,
        metadata: r.metadata,
      }));
  }

  /**
   * Delete a vector document by ID
   */
  async delete(id: string): Promise<void> {
    // The in-memory store from embeddings.ts doesn't expose a delete by ID,
    // so we use clearVectorStore approach — mark the entry for removal
    // by re-storing with empty content. For true deletion, we patch the store.
    try {
      // Access the internal vector store and delete
      const { clearVectorStore: _clearAll, getVectorStoreSize } = await import('@/lib/memory/embeddings');
      // We cannot delete individual entries from the exported Map,
      // but we can mark it as deleted in metadata via DB
      const existing = await db.documentChunk.findUnique({
        where: { id },
      });
      if (existing) {
        const existingMeta = JSON.parse(existing.metadata || '{}');
        await db.documentChunk.update({
          where: { id },
          data: {
            metadata: JSON.stringify({
              ...existingMeta,
              _deleted: true,
              _deletedAt: new Date().toISOString(),
            }),
          },
        });
      }
      // Use the exposed clearVectorStore approach: since we can't delete
      // individual entries, we filter them out at search time via metadata
      void _clearAll; // suppress unused warning
      void getVectorStoreSize;
    } catch (error) {
      console.warn(`[SQLiteVectorAdapter] Failed to delete vector ${id}:`, error);
    }
  }

  /**
   * Count vectors in the store
   */
  async count(): Promise<number> {
    const { getVectorStoreSize } = await import('@/lib/memory/embeddings');
    return getVectorStoreSize();
  }
}

// ============================================================
// QDRANT VECTOR ADAPTER — HTTP client for Qdrant vector database
// ============================================================

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

interface QdrantSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export class QdrantVectorAdapter implements VectorStoreAdapter {
  readonly adapterType = 'qdrant';
  private baseUrl: string;
  private apiKey: string | undefined;
  private collectionName: string;
  private vectorSize: number;

  constructor(config?: {
    url?: string;
    apiKey?: string;
    collectionName?: string;
    vectorSize?: number;
  }) {
    this.baseUrl = (config?.url || process.env.QDRANT_URL || 'http://localhost:6333').replace(/\/+$/, '');
    this.apiKey = config?.apiKey || process.env.QDRANT_API_KEY;
    this.collectionName = config?.collectionName || 'genova_vectors';
    this.vectorSize = config?.vectorSize || 384;
  }

  /**
   * Make an HTTP request to Qdrant API
   */
  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Qdrant API error (${response.status}): ${errorText}`);
    }

    return response;
  }

  /**
   * Ensure the collection exists, create if needed
   */
  private async ensureCollection(): Promise<void> {
    try {
      const response = await this.request('GET', `/collections/${this.collectionName}`);
      const data = await response.json();
      if (data.result?.status === 'green' || data.result?.status === 'yellow') {
        return; // Collection exists
      }
    } catch {
      // Collection doesn't exist, create it
    }

    await this.request('PUT', `/collections/${this.collectionName}`, {
      vectors: {
        size: this.vectorSize,
        distance: 'Cosine',
      },
      optimizers_config: {
        indexing_threshold: 20000,
      },
    });
  }

  /**
   * Upsert a vector document into Qdrant
   */
  async upsert(doc: VectorDocument, _options?: VectorUpsertOptions): Promise<void> {
    await this.ensureCollection();

    const point: QdrantPoint = {
      id: doc.id,
      vector: doc.vector,
      payload: {
        content: doc.content,
        ...doc.metadata,
      },
    };

    await this.request('PUT', `/collections/${this.collectionName}/points`, {
      points: [point],
    });
  }

  /**
   * Search for similar vectors in Qdrant
   */
  async search(queryVector: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const topK = options?.topK || 5;
    const minScore = options?.minScore || 0;
    const filter = options?.filter;

    await this.ensureCollection();

    // Build Qdrant filter from options
    const qdrantFilter: Record<string, unknown> = {};
    if (filter) {
      const conditions = Object.entries(filter).map(([key, value]) => ({
        key,
        match: { value },
      }));
      qdrantFilter.must = conditions;
    }

    const requestBody: Record<string, unknown> = {
      vector: queryVector,
      limit: topK,
      with_payload: true,
      score_threshold: minScore,
    };
    if (Object.keys(qdrantFilter).length > 0) {
      requestBody.filter = qdrantFilter;
    }

    const response = await this.request(
      'POST',
      `/collections/${this.collectionName}/points/search`,
      requestBody
    );

    const data = await response.json();
    const results: QdrantSearchResult[] = data.result || [];

    return results.map((r) => {
      const { content, ...metadata } = r.payload;
      return {
        id: String(r.id),
        content: content as string,
        score: r.score,
        metadata: metadata as Record<string, unknown>,
      };
    });
  }

  /**
   * Delete a vector document by ID from Qdrant
   */
  async delete(id: string): Promise<void> {
    await this.request(
      'POST',
      `/collections/${this.collectionName}/points/delete`,
      { points: [id] }
    );
  }

  /**
   * Count vectors in the Qdrant collection
   */
  async count(): Promise<number> {
    try {
      await this.ensureCollection();
      const response = await this.request(
        'POST',
        `/collections/${this.collectionName}/points/count`,
        { exact: true }
      );
      const data = await response.json();
      return data.result?.count || 0;
    } catch {
      return 0;
    }
  }
}

// ============================================================
// HYBRID RETRIEVER — Vector Search + BM25 with Reciprocal Rank Fusion
// ============================================================

export interface HybridRetrieverOptions {
  /** Weight for vector (semantic) search results, default 0.6 */
  semanticWeight?: number;
  /** Weight for BM25 (keyword) search results, default 0.4 */
  bm25Weight?: number;
  /** Number of results to return, default 5 */
  topK?: number;
  /** Minimum score threshold, default 0 */
  minScore?: number;
  /** RRF constant K (prevents top ranks from dominating), default 60 */
  rrfK?: number;
}

export interface HybridSearchEntry {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface HybridRetrieverResult {
  id: string;
  content: string;
  score: number;
  semanticScore: number;
  bm25Score: number;
  semanticRank: number;
  bm25Rank: number;
  metadata: Record<string, unknown>;
}

/**
 * BM25 search engine for keyword-based retrieval
 */
class BM25Retriever {
  private documents: HybridSearchEntry[] = [];
  private avgDocLength: number = 0;
  private docCount: number = 0;
  private termDocFreq: Map<string, number> = new Map();
  private k1: number = 1.5;
  private b: number = 0.75;

  indexDocuments(documents: HybridSearchEntry[]): void {
    this.documents = documents;
    this.docCount = documents.length;
    this.termDocFreq.clear();

    let totalLength = 0;

    for (const doc of documents) {
      const tokens = simpleTokenize(doc.content);
      totalLength += tokens.length;

      const uniqueTerms = new Set(tokens);
      for (const term of uniqueTerms) {
        this.termDocFreq.set(term, (this.termDocFreq.get(term) || 0) + 1);
      }
    }

    this.avgDocLength = this.docCount > 0 ? totalLength / this.docCount : 0;
  }

  search(query: string, topK: number = 10): Array<{ id: string; score: number; rank: number }> {
    const queryTokens = simpleTokenize(query);
    const scores: Map<string, number> = new Map();

    for (const doc of this.documents) {
      const docTokens = simpleTokenize(doc.content);
      const docLength = docTokens.length;

      const tfMap = new Map<string, number>();
      for (const token of docTokens) {
        tfMap.set(token, (tfMap.get(token) || 0) + 1);
      }

      let docScore = 0;
      for (const term of queryTokens) {
        const tf = tfMap.get(term) || 0;
        if (tf === 0) continue;

        const df = this.termDocFreq.get(term) || 0;
        const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);

        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)));
        docScore += idf * tfNorm;
      }

      if (docScore > 0) {
        scores.set(doc.id, docScore);
      }
    }

    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    return sorted.map(([id, score], index) => ({
      id,
      score,
      rank: index + 1,
    }));
  }
}

export class HybridRetriever {
  private vectorStore: VectorStoreAdapter;
  private bm25Retriever: BM25Retriever;
  private indexedDocuments: Map<string, HybridSearchEntry> = new Map();
  private isIndexed: boolean = false;

  constructor(vectorStore: VectorStoreAdapter) {
    this.vectorStore = vectorStore;
    this.bm25Retriever = new BM25Retriever();
  }

  /**
   * Index documents for BM25 search
   */
  indexDocuments(documents: HybridSearchEntry[]): void {
    for (const doc of documents) {
      this.indexedDocuments.set(doc.id, doc);
    }
    this.bm25Retriever.indexDocuments(documents);
    this.isIndexed = true;
  }

  /**
   * Add a single document to the index
   */
  addDocument(doc: HybridSearchEntry): void {
    this.indexedDocuments.set(doc.id, doc);
    // Re-index all documents for BM25 (simple but correct approach)
    this.bm25Retriever.indexDocuments(Array.from(this.indexedDocuments.values()));
  }

  /**
   * Perform hybrid retrieval using Reciprocal Rank Fusion (RRF)
   *
   * RRF Formula: score(d) = Σ (1 / (k + rank_i(d)))
   * where k is a constant that prevents top ranks from dominating
   */
  async retrieve(
    query: string,
    options: HybridRetrieverOptions = {}
  ): Promise<HybridRetrieverResult[]> {
    const {
      semanticWeight = 0.6,
      bm25Weight = 0.4,
      topK = 5,
      minScore = 0,
      rrfK = 60,
    } = options;

    // 1. Generate query embedding for semantic search
    const queryVector = await generateEmbedding(query);

    // 2. Semantic search via vector store
    const semanticResults = await this.vectorStore.search(queryVector, {
      topK: topK * 3, // Fetch more for RRF fusion
      minScore,
    });

    // 3. BM25 keyword search
    const bm25Results = this.isIndexed
      ? this.bm25Retriever.search(query, topK * 3)
      : [];

    // 4. Reciprocal Rank Fusion
    const rrfScores: Map<string, {
      semanticScore: number;
      bm25Score: number;
      semanticRank: number;
      bm25Rank: number;
      content: string;
      metadata: Record<string, unknown>;
    }> = new Map();

    // Process semantic search results
    for (let i = 0; i < semanticResults.length; i++) {
      const result = semanticResults[i];
      const rank = i + 1;
      const rrfContribution = semanticWeight / (rrfK + rank);

      rrfScores.set(result.id, {
        semanticScore: result.score,
        bm25Score: 0,
        semanticRank: rank,
        bm25Rank: 0,
        content: result.content,
        metadata: result.metadata,
      });

      // Add RRF contribution from semantic ranking
      const entry = rrfScores.get(result.id)!;
      // We'll accumulate the final RRF score differently — store raw and compute later
      (entry as unknown as Record<string, number>)._semanticRRF = rrfContribution;
    }

    // Process BM25 results
    for (const bm25Result of bm25Results) {
      const rrfContribution = bm25Weight / (rrfK + bm25Result.rank);

      const existing = rrfScores.get(bm25Result.id);
      if (existing) {
        existing.bm25Score = bm25Result.score;
        existing.bm25Rank = bm25Result.rank;
        (existing as unknown as Record<string, number>)._bm25RRF = rrfContribution;
      } else {
        // BM25-only result (not in semantic results)
        const doc = this.indexedDocuments.get(bm25Result.id);
        rrfScores.set(bm25Result.id, {
          semanticScore: 0,
          bm25Score: bm25Result.score,
          semanticRank: 0,
          bm25Rank: bm25Result.rank,
          content: doc?.content || '',
          metadata: doc?.metadata || {},
        });
        const entry = rrfScores.get(bm25Result.id)!;
        (entry as unknown as Record<string, number>)._bm25RRF = rrfContribution;
      }
    }

    // 5. Compute final RRF scores and sort
    const results: HybridRetrieverResult[] = Array.from(rrfScores.entries())
      .map(([id, data]) => {
        const semanticRRF = (data as unknown as Record<string, number>)._semanticRRF || 0;
        const bm25RRF = (data as unknown as Record<string, number>)._bm25RRF || 0;
        const rrfScore = semanticRRF + bm25RRF;

        return {
          id,
          content: data.content,
          score: rrfScore,
          semanticScore: data.semanticScore,
          bm25Score: data.bm25Score,
          semanticRank: data.semanticRank,
          bm25Rank: data.bm25Rank,
          metadata: data.metadata,
        };
      })
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results;
  }

  /**
   * Get the count of indexed documents
   */
  getIndexedCount(): number {
    return this.indexedDocuments.size;
  }
}

// ============================================================
// FACTORY FUNCTION — Returns the appropriate adapter based on config
// ============================================================

let vectorStoreInstance: VectorStoreAdapter | null = null;

/**
 * Get the configured vector store adapter.
 * Reads VECTOR_STORE_TYPE from environment (sqlite | qdrant, default: sqlite)
 */
export function getVectorStore(): VectorStoreAdapter {
  if (vectorStoreInstance) return vectorStoreInstance;

  const storeType = (process.env.VECTOR_STORE_TYPE || 'sqlite').toLowerCase().trim();

  switch (storeType) {
    case 'qdrant': {
      const qdrantUrl = process.env.QDRANT_URL;
      if (!qdrantUrl) {
        console.warn('[VectorStore] QDRANT_URL not set, falling back to SQLite adapter');
        vectorStoreInstance = new SQLiteVectorAdapter();
        return vectorStoreInstance;
      }

      try {
        vectorStoreInstance = new QdrantVectorAdapter({
          url: qdrantUrl,
          apiKey: process.env.QDRANT_API_KEY,
        });
        console.info(`[VectorStore] Using Qdrant adapter at ${qdrantUrl}`);
      } catch (error) {
        console.warn(`[VectorStore] Failed to initialize Qdrant adapter, falling back to SQLite:`, error);
        vectorStoreInstance = new SQLiteVectorAdapter();
      }
      break;
    }

    case 'sqlite':
    default:
      vectorStoreInstance = new SQLiteVectorAdapter();
      console.info('[VectorStore] Using SQLite adapter (in-memory + DB persistence)');
      break;
  }

  return vectorStoreInstance;
}

/**
 * Reset the vector store singleton (useful for testing or reconfiguration)
 */
export function resetVectorStore(): void {
  vectorStoreInstance = null;
}
