// ============================================================
// Gen3ia — Place de Prompts : librairie de domaine
// ============================================================
//  Modèle de données + validation + limites par plan pour la place
//  de prompts (équivalent d'un marketplace, mais dédié aux prompts).
//
//  Collections Firestore (ajoutées à la façade) :
//    - prompts           : les templates de prompts (publiés/brouillons)
//    - prompt_favorites  : association userId × promptId
//
//  Sécurité : le contenu d'un prompt NON publié n'est jamais renvoyé
//  aux réponses publiques ; seuls le propriétaire et les admin le lisent.
// ============================================================

export const PROMPT_CATEGORIES = [
  'marketing',
  'copywriting',
  'code',
  'support',
  'analysis',
  'creative',
  'education',
  'business',
  'data',
  'productivity',
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export type PromptStatus = 'draft' | 'published' | 'deprecated';

/**
 * Limites de publication par plan (nombre max de prompts PUBLIÉS).
 * Le backend ne retourne PAS d'erreur pour un brouillon — seulement pour
 * la publication au-delà du quota, comme pour les clés API.
 */
export const PROMPT_PUBLISH_LIMITS: Record<string, number> = {
  free: 3,
  starter: 10,
  pro: 50,
  enterprise: 500,
  admin: 500,
};

export interface PromptRecord {
  id?: string;
  userId: string;
  name: string;
  slug?: string;
  description: string;
  category: PromptCategory;
  tags: string[];
  content: string;
  variables: string[];
  status: PromptStatus;
  isActive: boolean;
  isOfficial: boolean;
  price: number;
  isFree: boolean;
  rating: number;
  reviewCount: number;
  favoriteCount: number;
  installCount: number;
  featured: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/** Variables dynamiques détectées dans un prompt : {{variable}}. */
export function detectVariables(content: string): string[] {
  if (!content) return [];
  const out: string[] = [];
  const re = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (!out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

/** Slug stable à partir du nom (reuse le pattern du marketplace). */
export function slugifyPrompt(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base}-${Date.now().toString(36)}`;
}

/** Limite de publication pour l'utilisateur ; défaut plan free. */
export function getPromptPublishLimit(plan: string): number {
  const key = (plan || 'free').toLowerCase();
  return PROMPT_PUBLISH_LIMITS[key] ?? PROMPT_PUBLISH_LIMITS.free!;
}

/** Normalise un score de rating dans [0,5]. */
export function clampRating(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(5, Math.max(0, v));
}

/** Masque le contenu d'un prompt aux visiteurs non-éligibles. */
export function toPublicPrompt(p: Record<string, unknown>, reveal = false) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug ?? null,
    description: p.description ?? '',
    category: p.category ?? 'copywriting',
    tags: Array.isArray(p.tags) ? p.tags : [],
    variables: Array.isArray(p.variables) ? p.variables : [],
    content: reveal && typeof p.content === 'string' ? p.content : undefined,
    authorId: p.userId ?? null,
    status: p.status ?? 'draft',
    isOfficial: p.isOfficial ?? false,
    price: Number(p.price) || 0,
    isFree: p.isFree ?? true,
    rating: clampRating(p.rating),
    reviewCount: Number(p.reviewCount) || 0,
    favoriteCount: Number(p.favoriteCount) || 0,
    installCount: Number(p.installCount) || 0,
    featured: p.featured ?? false,
    createdAt: p.createdAt ? String(p.createdAt) : null,
  };
}
