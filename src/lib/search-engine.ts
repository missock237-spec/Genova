// ============================================================
// SEARCH ENGINE V2 — Recherche globale amelioree
// Scoring pondere, fuzzy matching, suggestions,
// historique, cache memoization, filtres avances
//
// NOTE : projet migré de Prisma vers Cloud Firestore.
// Les requêtes reposent désormais sur la façade `db` (src/lib/db.ts).
// Firestore ne supporte pas `contains`/`mode` en natif : la recherche
// plein-texte est donc faite en mémoire après lecture des collections
// cibles (filtrage exact + fuzzy scoring côté serveur).
// ============================================================
import { db } from './db';
import { createLogger } from './logger';

const log = createLogger('search-engine');

export interface SearchResult {
  id: string;
  type: 'agent' | 'workflow' | 'dataset' | 'dashboard' | 'marketplace' | 'conversation' | 'template' | 'plugin';
  title: string;
  description: string;
  subtitle: string;
  icon: string;
  url: string;
  score: number;
  matchField?: string;
  matchPosition?: number;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  types?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'recent' | 'popular';
  filters?: Record<string, string>;
}

export interface SuggestionResult {
  text: string;
  type: string;
  count: number;
}

// Cache LRU simple
const searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
const CACHE_TTL = 30_000; // 30 secondes
const CACHE_MAX = 50;

// Plafond de lecture par collection (évite de scanner tout l'historique).
const SCAN_LIMIT = 500;

/**
 * Normalise une valeur `createdAt`/`updatedAt` Firestore en timestamp (ms).
 * Tolère les dates invalides (migration historique des sentinelles).
 */
function toTimestamp(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'object' && typeof (value as { _seconds?: number })._seconds === 'number') {
    return (value as { _seconds: number })._seconds * 1000;
  }
  const ms = new Date(value as string | number).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

function toStr(value: unknown): string {
  return String(value ?? '');
}

function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

export class SearchEngine {
  /**
   * Recherche globale avec scoring pondéré V2.
   */
  async search(query: string, userId: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!query || query.length < 2) return [];

    const q = query.toLowerCase().trim();
    const limit = options.limit || 20;
    const offset = options.offset || 0;
    const cacheKey = `${userId}:${q}:${options.types?.sort().join(',') || 'all'}:${options.sortBy || 'relevance'}`;

    // Cache check
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.results.slice(offset, offset + limit);
    }

    const types = options.types;
    const results: SearchResult[] = [];

    // Lancer toutes les recherches en parallèle
    await Promise.all([
      this.searchAgents(q, userId, results),
      this.searchWorkflows(q, userId, results),
      this.searchDatasets(q, userId, results),
      this.searchDashboards(q, userId, results),
      this.searchMarketplace(q, results),
      this.searchConversations(q, userId, results),
      this.searchTemplates(q, userId, results),
      this.searchMessages(q, userId, results),
    ]);

    // Scoring final avec boost contextuel
    for (const r of results) {
      r.score = this.computeBoostedScore(r, q);
    }

    // Tri selon l'option
    if (options.sortBy === 'recent') {
      results.sort((a, b) => (b.metadata?.updatedAt || 0) - (a.metadata?.updatedAt || 0));
    } else if (options.sortBy === 'popular') {
      results.sort((a, b) => (b.metadata?.usageCount || 0) - (a.metadata?.usageCount || 0));
    } else {
      results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    }

    const finalResults = results.slice(offset, offset + limit);

    // Mettre en cache
    searchCache.set(cacheKey, { results, timestamp: Date.now() });
    if (searchCache.size > CACHE_MAX) {
      const firstKey = searchCache.keys().next().value;
      if (firstKey) searchCache.delete(firstKey);
    }

    return finalResults;
  }

  /**
   * Suggestions en temps réel (préfixe match).
   */
  async suggest(query: string, userId: string): Promise<SuggestionResult[]> {
    if (!query || query.length < 1) return [];

    const q = query.toLowerCase().trim();
    const suggestions: SuggestionResult[] = [];

    const [agents, workflows, datasets] = await Promise.all([
      db.agent.findMany({ where: { ownerId: userId }, limit: SCAN_LIMIT, select: ['name'] }).catch(() => []),
      db.workflow.findMany({ where: { userId }, limit: SCAN_LIMIT, select: ['name'] }).catch(() => []),
      db.dataset.findMany({ where: { userId }, limit: SCAN_LIMIT, select: ['name'] }).catch(() => []),
    ]);

    for (const a of agents as Array<Record<string, unknown>>) {
      const name = toStr(a.name);
      if (name.toLowerCase().startsWith(q)) suggestions.push({ text: name, type: 'agent', count: 0 });
    }
    for (const w of workflows as Array<Record<string, unknown>>) {
      const name = toStr(w.name);
      if (name.toLowerCase().startsWith(q)) suggestions.push({ text: name, type: 'workflow', count: 0 });
    }
    for (const d of datasets as Array<Record<string, unknown>>) {
      const name = toStr(d.name);
      if (name.toLowerCase().startsWith(q)) suggestions.push({ text: name, type: 'dataset', count: 0 });
    }

    return suggestions.slice(0, 6);
  }

  /**
   * Fuzzy match (Levenshtein) pour tolérer les fautes de frappe.
   */
  private fuzzyMatch(text: string, query: string): number {
    if (text.includes(query)) return 1.0;

    const parts = query.split(/\s+/);
    let matchScore = 0;
    for (const part of parts) {
      if (part.length < 2) continue;
      if (text.includes(part)) {
        matchScore += part.length / query.length;
      } else {
        // Levenshtein simple pour 1 faute
        for (let i = 0; i <= text.length - part.length; i++) {
          let dist = 0;
          for (let j = 0; j < part.length; j++) {
            if (text[i + j] !== part[j]) dist++;
          }
          if (dist <= 1) { matchScore += (part.length / query.length) * 0.7; break; }
        }
      }
    }
    return Math.min(matchScore, 1.0);
  }

  /**
   * Scoring V2 avec boost contextuel.
   */
  private computeBoostedScore(result: SearchResult, query: string): number {
    const lower = result.title.toLowerCase();
    const desc = result.description.toLowerCase();
    let score = 0;

    // Score de base
    if (lower === query) score += 100;
    else if (lower.startsWith(query)) score += 85;
    else if (lower.includes(' ' + query)) score += 70;
    else if (lower.includes(query)) score += 55;
    else if (desc.includes(query)) score += 35;
    else score += this.fuzzyMatch(lower, query) * 30;

    // Boost par type (agents et workflows prioritaires)
    const typeBoost: Record<string, number> = {
      agent: 10, workflow: 8, dataset: 5, dashboard: 5,
      marketplace: 3, template: 3, conversation: 2, plugin: 2,
    };
    score += typeBoost[result.type] || 0;

    // Boost par métadonnées
    if (result.metadata?.usageCount) {
      score += Math.min(result.metadata.usageCount * 0.5, 5);
    }
    if (result.metadata?.rating) {
      score += result.metadata.rating * 1.5;
    }

    return Math.round(Math.min(score, 120));
  }

  // ===== RECHERCHES PAR MODULE =====

  private async searchAgents(q: string, userId: string, results: SearchResult[]) {
    const agents = await db.agent
      .findMany({ where: { ownerId: userId }, limit: SCAN_LIMIT })
      .catch(() => []) as Array<Record<string, unknown>>;
    for (const a of agents) {
      const name = toStr(a.name);
      const description = toStr(a.description);
      const role = toStr(a.role);
      const model = toStr(a.model);
      if (![name, description, role, model].some((f) => includesInsensitive(f, q))) continue;

      const matchField = includesInsensitive(name, q) ? 'name' : includesInsensitive(description, q) ? 'description' : 'role';
      results.push({
        id: toStr(a.id),
        type: 'agent',
        title: name,
        description: description || role,
        subtitle: `${model || '—'} · ${toStr(a.status)}`,
        icon: '🤖',
        url: '/agents/' + toStr(a.id),
        score: 0,
        matchField,
        metadata: { usageCount: Number(a.usageCount || 0), updatedAt: toTimestamp(a.updatedAt) },
      });
    }
  }

  private async searchWorkflows(q: string, userId: string, results: SearchResult[]) {
    const workflows = await db.workflow
      .findMany({ where: { userId }, limit: SCAN_LIMIT })
      .catch(() => []) as Array<Record<string, unknown>>;
    for (const w of workflows) {
      const name = toStr(w.name);
      const description = toStr(w.description);
      if (!includesInsensitive(name, q) && !includesInsensitive(description, q)) continue;

      const trigger = toStr(w.trigger);
      results.push({
        id: toStr(w.id),
        type: 'workflow',
        title: name,
        description: description || `Déclencheur: ${trigger}`,
        subtitle: `${toStr(w.status)} · ${trigger}`,
        icon: '⚡',
        url: '/workflows/' + toStr(w.id),
        score: 0,
        metadata: { updatedAt: toTimestamp(w.updatedAt) },
      });
    }
  }

  private async searchDatasets(q: string, userId: string, results: SearchResult[]) {
    const datasets = await db.dataset
      .findMany({ where: { userId }, limit: SCAN_LIMIT })
      .catch(() => []) as Array<Record<string, unknown>>;
    for (const d of datasets) {
      const name = toStr(d.name);
      const description = toStr(d.description);
      const tags = toStr(d.tags ?? '');
      if (![name, description, tags].some((f) => includesInsensitive(f, q))) continue;

      const source = toStr(d.source);
      const rowCount = Number(d.rowCount || 0);
      results.push({
        id: toStr(d.id),
        type: 'dataset',
        title: name,
        description: description || `${source} dataset`,
        subtitle: `${source} · ${rowCount} lignes`,
        icon: '📊',
        url: '/data/datasets/' + toStr(d.id),
        score: 0,
        metadata: { usageCount: rowCount },
      });
    }
  }

  private async searchDashboards(q: string, userId: string, results: SearchResult[]) {
    const dashboards = await db.dashboard
      .findMany({ where: { userId }, limit: SCAN_LIMIT })
      .catch(() => []) as Array<Record<string, unknown>>;
    for (const d of dashboards) {
      const name = toStr(d.name);
      const description = toStr(d.description);
      if (!includesInsensitive(name, q) && !includesInsensitive(description, q)) continue;

      results.push({
        id: toStr(d.id),
        type: 'dashboard',
        title: name,
        description: description || 'Tableau de bord',
        subtitle: 'Dashboard',
        icon: '📈',
        url: '/data/dashboards/' + toStr(d.id),
        score: 0,
      });
    }
  }

  private async searchMarketplace(q: string, results: SearchResult[]) {
    const listings = await db.marketplaceListing
      .findMany({ where: { status: 'published', isActive: true }, limit: SCAN_LIMIT })
      .catch(() => []) as Array<Record<string, unknown>>;
    for (const l of listings) {
      const name = toStr(l.name);
      const description = toStr(l.description);
      const type = toStr(l.type);
      if (!includesInsensitive(name, q) && !includesInsensitive(description, q)) continue;

      const price = Number(l.price || 0);
      results.push({
        id: toStr(l.id),
        type: 'markepline',
        title: name,
        description: description || type,
        subtitle: `${type}${price > 0 ? ` · ${price} FCFA` : ' · Gratuit'}`,
        icon: '🛒',
        url: '/marketplace/' + toStr(l.id),
        score: 0,
        metadata: { rating: Number(l.rating || 0) },
      });
    }
  }

  private async searchConversations(q: string, userId: string, results: SearchResult[]) {
    const conversations = await db.conversation
      .findMany({ where: { userId }, limit: SCAN_LIMIT })
      .catch(() => []) as Array<Record<string, unknown>>;
    for (const c of conversations) {
      const title = toStr(c.title);
      if (!includesInsensitive(title, q)) continue;

      results.push({
        id: toStr(c.id),
        type: 'conversation',
        title,
        description: `Conversation ${toStr(c.type)}`,
        subtitle: toStr(c.type),
        icon: '💬',
        url: '/chat/' + toStr(c.id),
        score: 0,
        metadata: { updatedAt: toTimestamp(c.updatedAt) },
      });
    }
  }

  private async searchTemplates(q: string, userId: string, results: SearchResult[]) {
    const templates = await db.workflowTemplate
      .findMany({ limit: SCAN_LIMIT })
      .catch(() => []) as Array<Record<string, unknown>>;
    for (const t of templates) {
      // Visibilité : public OU propriétaire
      const isPublic = t.isPublic === true;
      const owner = toStr(t.userId);
      if (!isPublic && owner !== userId) continue;

      const name = toStr(t.name);
      const description = toStr(t.description);
      if (!includesInsensitive(name, q) && !includesInsensitive(description, q)) continue;

      const category = toStr(t.category);
      results.push({
        id: toStr(t.id),
        type: 'template',
        title: name,
        description: description || category,
        subtitle: category,
        icon: toStr(t.icon) || '📋',
        url: '/templates/' + toStr(t.id),
        score: 0,
        metadata: { usageCount: Number(t.usageCount || 0) },
      });
    }
  }

  private async searchMessages(q: string, userId: string, results: SearchResult[]) {
    const conversations = await db.conversation
      .findMany({ where: { userId }, limit: 20, select: ['id', 'title'] })
      .catch(() => []) as Array<Record<string, unknown>>;
    const convIds = conversations.map((c) => toStr(c.id));
    if (convIds.length === 0) return;

    // Firestore ne supporte pas `in` sur la façade ; on filtre en mémoire
    // après lecture des messages récents de l'utilisateur.
    const messages = await db.message
      .findMany({ limit: SCAN_LIMIT })
      .catch(() => []) as Array<Record<string, unknown>>;

    for (const m of messages) {
      if (!convIds.includes(toStr(m.conversationId))) continue;
      const content = toStr(m.content);
      if (!includesInsensitive(content, q)) continue;

      const conv = conversations.find((c) => toStr(c.id) === toStr(m.conversationId));
      results.push({
        id: toStr(m.id),
        type: 'conversation',
        title: conv ? toStr(conv.title) : 'Message',
        description: content.slice(0, 100),
        subtitle: 'Message',
        icon: '💬',
        url: '/chat/' + toStr(m.conversationId),
        score: 0,
        matchField: 'content',
        metadata: { updatedAt: toTimestamp(m.createdAt) },
      });
    }
  }

  /**
   * Compteurs par type.
   */
  async getSearchCounts(userId: string): Promise<Record<string, number>> {
    const [agents, workflows, datasets, dashboards, conversations] = await Promise.all([
      db.agent.count({ where: { ownerId: userId } }),
      db.workflow.count({ where: { userId } }),
      db.dataset.count({ where: { userId } }),
      db.dashboard.count({ where: { userId } }),
      db.conversation.count({ where: { userId } }),
    ]);
    return { agents, workflows, datasets, dashboards, conversations };
  }

  /**
   * Vide le cache.
   */
  clearCache(): void {
    searchCache.clear();
    log.info('search_cache_cleared');
  }
}

export const searchEngine = new SearchEngine();
export default searchEngine;
