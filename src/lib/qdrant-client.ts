// ============================================================
// QDRANT CLIENT — Base vectorielle (recherche sémantique / RAG)
//
// Client production pour Qdrant (https://qdrant.tech) via fetch brut,
// sans dépendance tierce. Qdrant sert de stockage des embeddings pour
// la recherche sémantique et le RAG (Retrieval-Augmented Generation).
//
// Configuration (variables d'environnement) :
//   QDRANT_URL         — URL HTTP du serveur Qdrant (ex: http://localhost:6333)
//   QDRANT_API_KEY     — clé API (optionnelle, cloud Qdrant uniquement)
//   QDRANT_COLLECTION  — nom de collection par défaut (optionnel)
//
// Méthodes exposées :
//   ping()                     — teste la connectivité
//   listCollections()          — liste les collections
//   collectionExists(name)     — vérifie l'existence d'une collection
//   createCollection(name, dim)  — crée une collection (dimension des vecteurs)
//   deleteCollection(name)     — supprime une collection
//   upsertPoints(name, points) — insère/met à jour des points (vecteurs + payload)
//   search(name, vector, opts) — recherche k-plus-proches voisins + score
//   deletePoints(name, ids)    — supprime des points par id
// ============================================================

import { createLogger } from './logger';

const log = createLogger('qdrant');

/** Point Qdrant : identifiant + vecteur + métadonnées libres. */
export interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, unknown>;
}

/** Résultat d'une recherche (point + score de similarité). */
export interface QdrantSearchHit {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
  vector?: number[];
}

export interface QdrantSearchOptions {
  limit?: number;
  /** Filtre Qdrant (syntaxe JSON des filtres). */
  filter?: Record<string, unknown>;
  /** Inclure le payload dans la réponse (défaut : true). */
  withPayload?: boolean;
  /** Inclure le vecteur dans la réponse (défaut : false). */
  withVector?: boolean;
}

/** @returns l'URL de base Qdrant (sans slash final). */
function baseUrl(): string {
  return (process.env.QDRANT_URL || 'http://localhost:6333').replace(/\/$/, '');
}

/** @returns les en-têtes d'authentification (API key cloud optionnelle). */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = process.env.QDRANT_API_KEY || '';
  if (apiKey) headers['api-key'] = apiKey;
  return headers;
}

/** @returns true si Qdrant est configuré (URL présente). */
export function isQdrantConfigured(): boolean {
  return Boolean(process.env.QDRANT_URL);
}

/** Enveloppe un appel fetch vers Qdrant avec timeout et gestion d'erreur. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers || {}) },
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qdrant ${init.method || 'GET'} ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Client Qdrant.
 */
export class QdrantClient {
  /** Teste la connectivité au serveur (renvoie true si joignable). */
  async ping(): Promise<boolean> {
    if (!isQdrantConfigured()) return false;
    try {
      await request('/');
      return true;
    } catch (err) {
      log.warn('qdrant_ping_failed', { error: (err as Error).message });
      return false;
    }
  }

  /** Liste toutes les collections. */
  async listCollections(): Promise<string[]> {
    const data = await request<{ result: { collections: Array<{ name: string }> } }>('/collections');
    return data.result.collections.map((c) => c.name);
  }

  /** Vérifie l'existence d'une collection. */
  async collectionExists(name: string): Promise<boolean> {
    try {
      await request(`/collections/${name}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Crée une collection pour des vecteurs de dimension `dim`.
   * Distance par défaut : similarité cosinus.
   */
  async createCollection(name: string, dim: number, distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine'): Promise<void> {
    await request(`/collections/${name}`, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: { size: dim, distance },
      }),
    });
    log.info('qdrant_collection_created', { name, dim, distance });
  }

  /** Supprime une collection. */
  async deleteCollection(name: string): Promise<void> {
    await request(`/collections/${name}`, { method: 'DELETE' });
    log.info('qdrant_collection_deleted', { name });
  }

  /**
   * Insère ou met à jour des points. Si `wait` est vrai, attente que
   * l'opération soit indexée (utile en test immédiat de recherche).
   */
  async upsertPoints(name: string, points: QdrantPoint[], wait = true): Promise<void> {
    await request(`/collections/${name}/points?wait=${wait}`, {
      method: 'PUT',
      body: JSON.stringify({ points }),
    });
  }

  /**
   * Recherche les k-plus-proches voisins d'un vecteur.
   * Retourne un tableau de hits triés par score décroissant.
   */
  async search(name: string, vector: number[], options: QdrantSearchOptions = {}): Promise<QdrantSearchHit[]> {
    const limit = options.limit ?? 10;
    const data = await request<{ result: Array<Record<string, unknown>> }>(
      `/collections/${name}/points/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          vector,
          limit,
          with_payload: options.withPayload ?? true,
          with_vector: options.withVector ?? false,
          ...(options.filter ? { filter: options.filter } : {}),
        }),
      },
    );
    return data.result.map((r) => ({
      id: r.id as string | number,
      score: Number(r.score),
      payload: (r.payload as Record<string, unknown>) ?? undefined,
      ...(r.vector ? { vector: r.vector as number[] } : {}),
    }));
  }

  /** Supprime des points par identifiants. */
  async deletePoints(name: string, ids: Array<string | number>, wait = true): Promise<void> {
    await request(`/collections/${name}/points/delete?wait=${wait}`, {
      method: 'POST',
      body: JSON.stringify({ points: ids }),
    });
  }
}

export const qdrant = new QdrantClient();
export default qdrant;
