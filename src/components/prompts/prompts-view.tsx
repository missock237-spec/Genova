'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Search, Plus, X, Star, Download, Check, Loader2, Lock, Copy,
  FileText, Layers, Coffee, MessageSquare, AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import {
  PROMPT_CATEGORIES,
  type PromptCategory,
} from '@/lib/prompts';

// ============================================================
// Gen3ia — Place de Prompts (marketplace de templates de prompts)
// ============================================================
//  Parcours public : liste de prompts publiés (sans révéler le contenu).
//  Recherche + filtre catégorie + tri.
//  Création (auth) : formulaire, brouillon par défaut, publication limitée
//  par quota de plan (cf. PROMPT_PUBLISH_LIMITS côté serveur).
//  Détail : le contenu du prompt est révélé si gratuit (isFree), du propriétaire
//  ou admin; sinon une carte "premium" s'affiche.
// ============================================================

interface PublicPrompt {
  id: string;
  name: string;
  slug?: string | null;
  description: string;
  category: PromptCategory;
  tags: string[];
  variables: string[];
  content?: string;
  authorId?: string | null;
  price: number;
  isFree: boolean;
  rating: number;
  reviewCount: number;
  favoriteCount: number;
  installCount: number;
  featured?: boolean;
  createdAt?: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortMode = 'newest' | 'popular' | 'rating' | 'featured';

const categoryMeta: Record<PromptCategory, { icon: React.ElementType; color: string }> = {
  marketing: { icon: Coffee, color: '#F59E0B' },
  copywriting: { icon: FileText, color: '#00F5FF' },
  code: { icon: Layers, color: '#22D3EE' },
  support: { icon: MessageSquare, color: '#34D399' },
  analysis: { icon: Star, color: '#A78BFA' },
  creative: { icon: Plus, color: '#F472B6' },
  education: { icon: Coffee, color: '#FB923C' },
  business: { icon: Plus, color: '#60A5FA' },
  data: { icon: Layers, color: '#2DD4BF' },
  productivity: { icon: Check, color: '#FACC15' },
};

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'newest', label: 'Récents' },
  { value: 'popular', label: 'Populaires' },
  { value: 'rating', label: 'Mieux notés' },
  { value: 'featured', label: 'À la une' },
];

export function PromptsView() {
  const { user } = useAuthStore();

  const [prompts, setPrompts] = useState<PublicPrompt[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [category, setCategory] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulaire
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', category: 'copywriting' as PromptCategory,
    content: '', tags: '', price: '0', status: 'draft' as 'draft' | 'published',
  });

  // Détail
  const [detail, setDetail] = useState<null | {
    loading: boolean; data?: PublicPrompt; error?: string;
  }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('page', String(pagination.page));
    params.set('limit', '20');
    params.set('sort', sort);
    if (category) params.set('category', category);
    if (searchInput.trim()) params.set('search', searchInput.trim());
    try {
      const res = await fetch(`/api/prompts?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur de chargement');
      setPrompts(json.data || []);
      setPagination(json.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (e) {
      setError((e as Error).message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, category, searchInput, sort]);

  useEffect(() => { void load(); }, [load]);

  // Débounce de la recherche
  useEffect(() => {
    const t = setTimeout(() => {
      if (pagination.page !== 1) {
        setPagination((p) => ({ ...p, page: 1 }));
      } else {
        void load();
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openDetail = useCallback(async (id: string) => {
    setDetail({ loading: true });
    try {
      const res = await fetch(`/api/prompts/${id}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur');
      setDetail({ loading: false, data: json.data });
    } catch (e) {
      setDetail({ loading: false, error: (e as Error).message });
    }
  }, []);

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          category: form.category,
          content: form.content,
          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
          price: Number(form.price) > 0 ? Number(form.price) : 0,
          status: form.status,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur de création');
      setShowCreate(false);
      setForm({ name: '', description: '', category: 'copywriting', content: '', tags: '', price: '0', status: 'draft' });
      setPagination((p) => ({ ...p, page: 1 }));
      void load();
    } catch (e) {
      setCreateError((e as Error).message || 'Erreur de création');
    } finally {
      setCreating(false);
    }
  };

  const copyContent = async () => {
    const text = detail?.data?.content;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard indisponible — silencieux
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={12}
            className={cn(
              'text-[#00F5FF]',
              rating < i - 0.5 && 'text-[#2A2E36]',
            )}
            fill={rating >= i - 0.5 ? '#00F5FF' : 'none'}
          />
        ))}
      </div>
    );
  };

  const visiblePrompts = useMemo(
    () => prompts.filter((p) =>
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
    ),
    [prompts, search],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#E6E8EC]">Place de Prompts</h1>
          <p className="text-sm text-[#8A9099] mt-0.5">
            Des templates de prompts prêts à l&apos;emploi — {pagination.total} en ligne.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00F5FF] text-[#001416] px-4 py-2 text-sm font-semibold hover:bg-[#33f7ff] transition-colors"
        >
          <Plus size={16} /> Nouveau prompt
        </button>
      </div>

      {/* Recherche + filtres */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9099]" />
          <input
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setSearch(e.target.value); }}
            placeholder="Rechercher un prompt, un tag…"
            className="w-full rounded-lg border border-[#1C1E22] bg-[#0B0C0D] pl-9 pr-3 py-2 text-sm text-[#E6E8EC] placeholder:text-[#8A9099] focus:outline-none focus:ring-2 focus:ring-[#00F5FF]/40"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-lg border border-[#1C1E22] bg-[#0B0C0D] px-3 py-2 text-sm text-[#E6E8EC] focus:outline-none focus:ring-2 focus:ring-[#00F5FF]/40"
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Catégories */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory('')}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            category === ''
              ? 'border-[#00F5FF] text-[#00F5FF] bg-[rgba(0,245,255,0.08)]'
              : 'border-[#1C1E22] text-[#8A9099] hover:text-[#E6E8EC]',
          )}
        >
          Toutes
        </button>
        {PROMPT_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(category === c ? '' : c)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              category === c
                ? 'border-[#00F5FF] text-[#00F5FF] bg-[rgba(0,245,255,0.08)]'
                : 'border-[#1C1E22] text-[#8A9099] hover:text-[#E6E8EC]',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-[#FF5C5C]/30 bg-[rgba(255,92,92,0.06)] px-3 py-2 text-sm text-[#FF5C5C]">
          {error}
        </div>
      )}

      {/* Grille */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[#00F5FF]" />
        </div>
      ) : visiblePrompts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#8A9099]">
          <FileText className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">Aucun prompt trouvé.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visiblePrompts.map((p) => {
            const meta = categoryMeta[p.category] || categoryMeta.copywriting;
            const Icon = meta.icon;
            return (
              <motion.button
                key={p.id}
                layout
                onClick={() => openDetail(p.id)}
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="text-left rounded-xl border border-[#1C1E22] bg-[#0B0C0D] p-4 hover:border-[#00F5FF]/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ background: `${meta.color}1a`, color: meta.color }}
                    >
                      <Icon size={16} />
                    </span>
                    <div>
                      <p className="text-xs font-medium capitalize" style={{ color: meta.color }}>
                        {p.category}
                      </p>
                      {p.featured && (
                        <span className="text-[10px] text-[#FACC15] font-medium">★ À la une</span>
                      )}
                    </div>
                  </div>
                  <span className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                    p.isFree ? 'bg-[rgba(52,211,153,0.12)] text-[#34D399]' : 'bg-[rgba(0,245,255,0.1)] text-[#00F5FF]',
                  )}>
                    {p.isFree ? 'Gratuit' : `${p.price}$`}
                  </span>
                </div>

                <h3 className="mt-3 font-semibold text-[#E6E8EC] leading-snug">{p.name}</h3>
                <p className="mt-1 text-sm text-[#8A9099] line-clamp-2">{p.description}</p>

                {p.variables.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.variables.map((v) => (
                      <span key={v} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1C1E22] text-[#00F5FF]/80">
                        {'{{'} {v} {'}}'}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-[#1C1E22] pt-3 text-xs text-[#8A9099]">
                  <span className="flex items-center gap-1">
                    <Download size={12} /> {p.installCount}
                  </span>
                  {renderStars(p.rating)}
                  <span className="text-[#5A6068]">{p.reviewCount} avis</span>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={pagination.page <= 1}
            onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            className="rounded-lg border border-[#1C1E22] px-3 py-1.5 text-sm text-[#8A9099] disabled:opacity-40 hover:text-[#E6E8EC]"
          >
            Précédent
          </button>
          <span className="text-sm text-[#8A9099]">{pagination.page} / {pagination.totalPages}</span>
          <button
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            className="rounded-lg border border-[#1C1E22] px-3 py-1.5 text-sm text-[#8A9099] disabled:opacity-40 hover:text-[#E6E8EC]"
          >
            Suivant
          </button>
        </div>
      )}

      {/* Modale création */}
      <AnimatePresence>
        {showCreate && (
          <ModalShell onClose={() => setShowCreate(false)}>
            <form onSubmit={submitCreate} className="space-y-4">
              <h2 className="text-lg font-semibold text-[#E6E8EC]">Nouveau prompt</h2>

              <div>
                <label className="text-xs text-[#8A9099]">Nom *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required minLength={3}
                  className="mt-1 w-full rounded-lg border border-[#1C1E22] bg-[#0B0C0D] px-3 py-2 text-sm text-[#E6E8EC] focus:outline-none focus:ring-2 focus:ring-[#00F5FF]/40"
                />
              </div>

              <div>
                <label className="text-xs text-[#8A9099]">Description *</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required minLength={10} rows={2}
                  className="mt-1 w-full rounded-lg border border-[#1C1E22] bg-[#0B0C0D] px-3 py-2 text-sm text-[#E6E8EC] focus:outline-none focus:ring-2 focus:ring-[#00F5FF]/40"
                />
              </div>

              <div>
                <label className="text-xs text-[#8A9099]">Contenu du prompt *</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required minLength={5} rows={5}
                  placeholder="Utilisez {{variables}} entre accolades pour les champs dynamiques."
                  className="mt-1 w-full rounded-lg border border-[#1C1E22] bg-[#0B0C0D] px-3 py-2 text-sm font-mono text-[#E6E8EC] focus:outline-none focus:ring-2 focus:ring-[#00F5FF]/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#8A9099]">Catégorie</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as PromptCategory })}
                    className="mt-1 w-full rounded-lg border border-[#1C1E22] bg-[#0B0C0D] px-3 py-2 text-sm text-[#E6E8EC] focus:outline-none focus:ring-2 focus:ring-[#00F5FF]/40"
                  >
                    {PROMPT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#8A9099]">Prix ($)</label>
                  <input
                    type="number" min={0} step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#1C1E22] bg-[#0B0C0D] px-3 py-2 text-sm text-[#E6E8EC] focus:outline-none focus:ring-2 focus:ring-[#00F5FF]/40"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-[#8A9099]">Tags (séparés par des virgules)</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="email, marketing, chatbot"
                  className="mt-1 w-full rounded-lg border border-[#1C1E22] bg-[#0B0C0D] px-3 py-2 text-sm text-[#E6E8EC] focus:outline-none focus:ring-2 focus:ring-[#00F5FF]/40"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-[#8A9099]">Statut :</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as 'draft' | 'published' })}
                  className="rounded-lg border border-[#1C1E22] bg-[#0B0C0D] px-3 py-1.5 text-sm text-[#E6E8EC] focus:outline-none"
                >
                  <option value="draft">Brouillon</option>
                  <option value="published">Publié</option>
                </select>
                {form.status === 'published' && (
                  <span className="text-[10px] text-[#8A9099]">
                    La publication est limitée par votre plan.
                  </span>
                )}
              </div>

              {createError && (
                <div className="rounded-lg border border-[#FF5C5C]/30 bg-[rgba(255,92,92,0.06)] px-3 py-2 text-sm text-[#FF5C5C] flex gap-2 items-center">
                  <AlertTriangle size={14} /> {createError}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-[#1C1E22] px-4 py-2 text-sm text-[#8A9099] hover:text-[#E6E8EC]">
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#00F5FF] text-[#001416] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {creating && <Loader2 size={14} className="animate-spin" />}
                  {form.status === 'published' ? 'Publier' : 'Créer le brouillon'}
                </button>
              </div>
            </form>
          </ModalShell>
        )}
      </AnimatePresence>

      {/* Modale détail */}
      <AnimatePresence>
        {detail && (
          <ModalShell onClose={() => setDetail(null)}>
            {detail.loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[#00F5FF]" />
              </div>
            ) : detail.error ? (
              <div className="rounded-lg border border-[#FF5C5C]/30 bg-[rgba(255,92,92,0.06)] p-4 text-sm text-[#FF5C5C]">
                {detail.error}
              </div>
            ) : detail.data ? (
              <DetailContent prompt={detail.data} onCopy={copyContent} isOwner={!!user && user.id === detail.data.authorId} />
            ) : null}
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[#1C1E22] bg-[#131417] p-5 shadow-2xl"
        initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-[#8A9099] hover:text-[#E6E8EC]"
          aria-label="Fermer"
        >
          <X size={18} />
        </button>
        {children}
      </motion.div>
    </motion.div>
  );
}

function DetailContent({ prompt, onCopy, isOwner }: { prompt: PublicPrompt; onCopy: () => void; isOwner: boolean }) {
  const revealed = !!prompt.content;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium capitalize text-[#00F5FF]">{prompt.category}</span>
        <span className={cn(
          'text-xs font-semibold px-2 py-0.5 rounded-full',
          prompt.isFree ? 'bg-[rgba(52,211,153,0.12)] text-[#34D399]' : 'bg-[rgba(0,245,255,0.1)] text-[#00F5FF]',
        )}>
          {prompt.isFree ? 'Gratuit' : `${prompt.price}$`}
        </span>
      </div>
      <div>
        <h2 className="text-xl font-bold text-[#E6E8EC]">{prompt.name}</h2>
        <p className="mt-1 text-sm text-[#8A9099]">{prompt.description}</p>
      </div>

      <div className="flex flex-wrap gap-1">
        {prompt.tags.map((t) => (
          <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[#1C1E22] text-[#8A9099]">#{t}</span>
        ))}
      </div>

      {revealed ? (
        <>
          <div className="rounded-xl border border-[#1C1E22] bg-[#0B0C0D] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#8A9099]">Contenu du prompt</span>
              <button onClick={onCopy} className="inline-flex items-center gap-1 text-xs text-[#00F5FF] hover:text-[#33f7ff]">
                <Copy size={12} /> Copier
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-sm text-[#E6E8EC] leading-relaxed">
              {prompt.content}
            </pre>
          </div>
          <div className="flex flex-wrap gap-1">
            {prompt.variables.map((v) => (
              <span key={v} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1C1E22] text-[#00F5FF]/80">
                {'{{'} {v} {'}}'}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#1C1E22] bg-[#0B0C0D] p-8 text-center">
          <Lock className="h-8 w-8 text-[#8A9099] mb-3" />
          <p className="text-sm text-[#E6E8EC]">Promotion premium</p>
          <p className="mt-1 text-xs text-[#8A9099]">
            Ce prompt est réservé ({prompt.price}$). Achetez-le pour révéler son contenu.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[#1C1E22] pt-3 text-xs text-[#8A9099]">
        <span className="flex items-center gap-1"><Download size={12} /> {prompt.installCount} installations</span>
        <span>{prompt.reviewCount} avis · {prompt.favoriteCount} favoris</span>
      </div>
    </div>
  );
}
