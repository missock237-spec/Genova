// Simple text similarity using TF-IDF-like approach
// (In production, you'd use OpenAI embeddings + Qdrant)

/**
 * Tokenize text into lowercase words, removing punctuation
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
  // Normalize by document length
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
 * Calculate similarity between two texts (0 to 1)
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
 * Find the most relevant documents for a query
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
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}
