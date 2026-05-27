// Embeddings Engine — Real semantic embeddings using AI providers
// Priority: OpenAI Embeddings API > HuggingFace Inference > Deterministic fallback
// Falls back to TF-IDF similarity when no embedding API is available
// Supports: OpenAI text-embedding-3-small, Groq (future), local TF-IDF

import { chatCompletion } from '@/lib/ai-router';

// ============================================================
// EMBEDDING INTERFACE
// ============================================================

export interface EmbeddingVector {
  id: string;
  vector: number[];
  text: string;
  metadata: Record<string, unknown>;
}

export interface EmbeddingResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

// ============================================================
// EMBEDDING PROVIDERS — Try real embedding APIs first
// ============================================================

type EmbeddingProvider = 'openai' | 'groq' | 'deterministic' | 'llm_fallback';

let activeProvider: EmbeddingProvider | null = null;

/**
 * Detect the best available embedding provider
 */
async function detectEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (activeProvider) return activeProvider;

  // 1. Try OpenAI Embeddings API (best quality)
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        activeProvider = 'openai';
        return 'openai';
      }
    } catch {
      // OpenAI not available
    }
  }

  // 2. Try Groq (if they add embedding support)
  if (process.env.GROQ_API_KEY) {
    // Groq doesn't have embedding API yet, skip
    // Will be enabled when Groq adds embedding support
  }

  // 3. Fall back to deterministic
  activeProvider = 'deterministic';
  return 'deterministic';
}

/**
 * Reset the provider cache (for testing)
 */
export function resetEmbeddingProvider(): void {
  activeProvider = null;
}

// ============================================================
// TF-IDF ENGINE (Local fallback — always available)
// ============================================================

/**
 * Tokenize text into lowercase words, removing punctuation
 * Supports French accented characters
 */
export function simpleTokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\sàâäéèêëïîôùûüÿçœæ]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);
}

/**
 * Calculate term frequency for a document
 */
function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  for (const [term, count] of tf) {
    tf.set(term, count / tokens.length);
  }
  return tf;
}

/**
 * Calculate cosine similarity between two term frequency maps
 */
function cosineSimilarity(tf1: Map<string, number>, tf2: Map<string, number>): number {
  const allTerms = new Set([...tf1.keys(), ...tf2.keys()]);
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (const term of allTerms) {
    const v1 = tf1.get(term) || 0;
    const v2 = tf2.get(term) || 0;
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Calculate similarity between two texts using TF-IDF (0 to 1)
 */
export function calculateSimilarity(text1: string, text2: string): number {
  const tokens1 = simpleTokenize(text1);
  const tokens2 = simpleTokenize(text2);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const tf1 = termFrequency(tokens1);
  const tf2 = termFrequency(tokens2);

  return cosineSimilarity(tf1, tf2);
}

/**
 * Find the most relevant documents for a query using TF-IDF
 */
export function findMostRelevant(
  query: string,
  documents: Array<{ content: string; [key: string]: unknown }>,
  topK: number = 5
): Array<{ document: { content: string; [key: string]: unknown }; score: number }> {
  const scored = documents.map(doc => ({
    document: doc,
    score: calculateSimilarity(query, doc.content),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Simple keyword extraction from text
 */
export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
  const tokens = simpleTokenize(text);
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  // French stop words
  const stopWords = new Set(['les', 'des', 'une', 'que', 'qui', 'est', 'dans', 'pour', 'sur', 'avec', 'son', 'cette', 'mais', 'sont', 'nous', 'vous', 'ils', 'elle', 'tout', 'plus', 'aussi', 'comme', 'bien', 'entre', 'sans', 'alors', 'peut', 'ses', 'aux', 'avait', 'avoir', 'fait', 'autre', 'tres']);

  return Array.from(freq.entries())
    .filter(([word]) => !stopWords.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

// ============================================================
// SEMANTIC EMBEDDINGS — Using AI providers for real embeddings
// ============================================================

// In-memory vector store for fast similarity search
const vectorStore: Map<string, EmbeddingVector> = new Map();

/**
 * Generate embeddings using the best available provider
 * Priority: OpenAI Embeddings API → Deterministic fallback (fast, reliable)
 * The old LLM-based approach (asking chat model to generate 384 numbers) is
 * unreliable and expensive — it's kept only as a last-resort option.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = await detectEmbeddingProvider();

  switch (provider) {
    case 'openai':
      return generateOpenAIEmbedding(text);
    case 'deterministic':
    default:
      return generateDeterministicEmbedding(text);
  }
}

/**
 * Generate embeddings using OpenAI's text-embedding-3-small model
 * High quality 1536-dim embeddings, truncated to 384 for storage efficiency
 * Cost: ~$0.02 per 1M tokens (very affordable)
 */
async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return generateDeterministicEmbedding(text);

  try {
    const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: text.substring(0, 8000), // OpenAI limit
        dimensions: 384, // Request 384-dim output directly (supported by text-embedding-3-small)
      }),
    });

    if (!response.ok) {
      // Fall back to deterministic
      return generateDeterministicEmbedding(text);
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding as number[] | undefined;

    if (embedding && Array.isArray(embedding) && embedding.length >= 384) {
      return embedding.slice(0, 384);
    }

    // If API returned wrong dimensions, fall back
    return generateDeterministicEmbedding(text);
  } catch {
    return generateDeterministicEmbedding(text);
  }
}

/**
 * Generate a deterministic pseudo-embedding from text
 * Uses character n-gram hashing for a reasonable approximation
 */
function generateDeterministicEmbedding(text: string): number[] {
  const dim = 384;
  const vector = new Array(dim).fill(0);
  const tokens = simpleTokenize(text);

  for (const token of tokens) {
    for (let i = 0; i < token.length; i++) {
      const charCode = token.charCodeAt(i);
      // Hash each character into multiple dimensions
      for (let j = 0; j < 3; j++) {
        const idx = (charCode * (i + 1) * (j + 1)) % dim;
        vector[idx] += Math.sin(charCode * 0.01 + i * 0.1 + j * 0.05);
      }
    }
  }

  // Normalize the vector
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vector[i] /= norm;
    }
  }

  return vector;
}

/**
 * Store an embedding in the vector store
 */
export function storeEmbedding(id: string, text: string, vector: number[], metadata: Record<string, unknown> = {}): void {
  vectorStore.set(id, { id, vector, text, metadata });
}

/**
 * Search for similar embeddings using cosine similarity
 */
export function searchSimilar(
  queryVector: number[],
  topK: number = 5,
  filter?: (entry: EmbeddingVector) => boolean
): EmbeddingResult[] {
  const results: EmbeddingResult[] = [];

  for (const entry of vectorStore.values()) {
    if (filter && !filter(entry)) continue;

    const score = vectorCosineSimilarity(queryVector, entry.vector);
    results.push({
      id: entry.id,
      text: entry.text,
      score,
      metadata: entry.metadata,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Calculate cosine similarity between two vectors
 */
function vectorCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Clear the in-memory vector store
 */
export function clearVectorStore(): void {
  vectorStore.clear();
}

/**
 * Get the size of the vector store
 */
export function getVectorStoreSize(): number {
  return vectorStore.size;
}

// ============================================================
// BM25 ENGINE — For hybrid search
// ============================================================

export interface BM25Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class BM25Engine {
  private documents: BM25Document[] = [];
  private avgDocLength: number = 0;
  private docCount: number = 0;
  private termDocFreq: Map<string, number> = new Map(); // How many docs contain each term
  private k1: number = 1.5; // Term frequency saturation parameter
  private b: number = 0.75;  // Length normalization parameter

  /**
   * Index documents for BM25 search
   */
  indexDocuments(documents: BM25Document[]): void {
    this.documents = documents;
    this.docCount = documents.length;
    this.termDocFreq.clear();

    let totalLength = 0;

    for (const doc of documents) {
      const tokens = simpleTokenize(doc.content);
      totalLength += tokens.length;

      // Count unique terms per document
      const uniqueTerms = new Set(tokens);
      for (const term of uniqueTerms) {
        this.termDocFreq.set(term, (this.termDocFreq.get(term) || 0) + 1);
      }
    }

    this.avgDocLength = this.docCount > 0 ? totalLength / this.docCount : 0;
  }

  /**
   * Search using BM25 algorithm
   */
  search(query: string, topK: number = 5): Array<{ id: string; content: string; score: number; metadata?: Record<string, unknown> }> {
    const queryTokens = simpleTokenize(query);
    const scores: Map<string, number> = new Map();

    for (const doc of this.documents) {
      const docTokens = simpleTokenize(doc.content);
      const docLength = docTokens.length;

      // Term frequency map for this document
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

        // BM25 score formula
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)));
        docScore += idf * tfNorm;
      }

      if (docScore > 0) {
        scores.set(doc.id, docScore);
      }
    }

    // Sort by score and return top K
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    return sorted.map(([id, score]) => {
      const doc = this.documents.find(d => d.id === id)!;
      return { id, content: doc.content, score, metadata: doc.metadata };
    });
  }
}

// ============================================================
// HYBRID SEARCH — Combines BM25 + Semantic embeddings
// ============================================================

export interface HybridSearchResult {
  id: string;
  content: string;
  score: number;
  semanticScore: number;
  bm25Score: number;
  metadata: Record<string, unknown>;
}

export async function hybridSearch(
  query: string,
  documents: BM25Document[],
  options: {
    topK?: number;
    semanticWeight?: number;  // Weight for semantic search (0-1), default 0.6
    bm25Weight?: number;      // Weight for BM25 search (0-1), default 0.4
    useReranking?: boolean;
    userId?: string;
  } = {}
): Promise<HybridSearchResult[]> {
  const {
    topK = 5,
    semanticWeight = 0.6,
    bm25Weight = 0.4,
    useReranking = false,
  } = options;

  // 1. BM25 Search
  const bm25Engine = new BM25Engine();
  bm25Engine.indexDocuments(documents);
  const bm25Results = bm25Engine.search(query, topK * 2);

  // 2. Semantic Search
  const queryVector = await generateEmbedding(query);
  const semanticResults = searchSimilar(queryVector, topK * 2);

  // 3. Combine scores
  const combinedScores: Map<string, HybridSearchResult> = new Map();

  // Add BM25 results
  const maxBm25Score = Math.max(...bm25Results.map(r => r.score), 1);
  for (const result of bm25Results) {
    const normalizedScore = result.score / maxBm25Score;
    combinedScores.set(result.id, {
      id: result.id,
      content: result.content,
      score: normalizedScore * bm25Weight,
      semanticScore: 0,
      bm25Score: normalizedScore,
      metadata: result.metadata || {},
    });
  }

  // Add Semantic results
  for (const result of semanticResults) {
    const existing = combinedScores.get(result.id);
    if (existing) {
      existing.semanticScore = result.score;
      existing.score += result.score * semanticWeight;
    } else {
      combinedScores.set(result.id, {
        id: result.id,
        content: result.text,
        score: result.score * semanticWeight,
        semanticScore: result.score,
        bm25Score: 0,
        metadata: result.metadata,
      });
    }
  }

  // 4. Also do TF-IDF search for additional coverage
  const tfidfDocs = documents.map(d => ({ content: d.content, ...d.metadata }));
  const tfidfResults = findMostRelevant(query, tfidfDocs, topK);
  for (const result of tfidfResults) {
    const docData = result.document as Record<string, unknown>;
    const docId = docData.id as string;
    if (!docId) continue;
    const existing = combinedScores.get(docId);
    if (existing) {
      existing.score += result.score * 0.1; // Small bonus from TF-IDF
    }
  }

  // 5. Sort by combined score
  let results = Array.from(combinedScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // 6. Reranking (if enabled)
  if (useReranking && results.length > 0) {
    results = await rerankResults(query, results);
  }

  return results;
}

// ============================================================
// RERANKING — Cross-encoder style reranking using LLM
// ============================================================

export async function rerankResults(
  query: string,
  results: HybridSearchResult[],
  topK?: number
): Promise<HybridSearchResult[]> {
  if (results.length === 0) return results;

  try {
    const documentsText = results
      .map((r, i) => `[Doc ${i + 1}]: ${r.content.substring(0, 300)}`)
      .join('\n\n');

    const rerankPrompt = `Tu es un modèle de reranking. Évalue la pertinence de chaque document pour la requête donnée.

Requête: ${query}

Documents:
${documentsText}

Pour chaque document, donne un score de pertinence de 0 à 1.
Réponds UNIQUEMENT en JSON:
{
  "rankings": [
    { "docIndex": 1, "relevanceScore": 0.95, "reason": "Pertinent car..." },
    { "docIndex": 2, "relevanceScore": 0.3, "reason": "Peu pertinent car..." }
  ]
}`;

    const result = await chatCompletion([
      { role: 'system', content: rerankPrompt },
      { role: 'user', content: 'Rerank les documents.' },
    ], 'quick_chat');

    let parsed: { rankings: Array<{ docIndex: number; relevanceScore: number; reason: string }> };
    try {
      let content = result.content.trim();
      content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    } catch {
      // If parsing fails, return original results
      return results;
    }

    // Apply reranking scores
    for (const ranking of parsed.rankings) {
      const idx = ranking.docIndex - 1;
      if (idx >= 0 && idx < results.length) {
        // Blend original score with reranking score (70% reranking, 30% original)
        results[idx].score = results[idx].score * 0.3 + ranking.relevanceScore * 0.7;
      }
    }

    // Re-sort by new scores
    results.sort((a, b) => b.score - a.score);
  } catch {
    // If reranking fails, return original results
  }

  if (topK) {
    return results.slice(0, topK);
  }
  return results;
}
