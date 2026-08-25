'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Sparkles,
  Download,
  History,
  Settings2,
  SlidersHorizontal,
  RotateCcw,
  Copy,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  ImagePlus,
  Layers,
  Hash,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Types partagés avec /api/generation
// ─────────────────────────────────────────────────────────────

interface MetaModel {
  label: string;
  hfId: string;
  defaultSteps: number;
  defaultGuidance: number;
  maxPixels: number;
  supportsLora: boolean;
}

interface MetaResolution {
  key: string;
  label: string;
  width: number;
  height: number;
}

interface MetaStyle {
  key: string;
  label: string;
}

interface GenerationMeta {
  models: MetaModel[];
  resolutions: MetaResolution[];
  styles: MetaStyle[];
}

interface GeneratedImage {
  id?: string;
  imageUrl?: string;
  model?: string;
  width: number;
  height: number;
}

interface HistoryImage {
  id: string;
  prompt: string;
  model: string;
  status: string;
  imageUrl: string | null;
  costUsd: number;
  width: number;
  height: number;
  createdAt: string;
}

interface HistoryResponse {
  images: HistoryImage[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('genova_token');
}

function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('genova_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id || parsed?.uid || null;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Générateur d'image placeholder "mode démo" (SVG data-URL) quand le backend échoue. */
function makeDemoImage(prompt: string, width: number, height: number, seed: number): string {
  const short = (prompt || 'Aperçu').slice(0, 80);
  const hue = (seed % 360);
  const hue2 = (seed % 180) + 90;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 70% 45%)"/>` +
    `<stop offset="1" stop-color="hsl(${hue2} 70% 35%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/>` +
    `<text x="50%" y="50%" fill="rgba(255,255,255,0.92)" font-family="system-ui, sans-serif" font-size="24" text-anchor="middle" dominant-baseline="middle">Mode démo</text>` +
    `<text x="50%" y="58%" fill="rgba(255,255,255,0.75)" font-family="system-ui, sans-serif" font-size="15" text-anchor="middle">${short}</text>` +
    `<circle cx="${width * 0.85}" cy="${height * 0.15}" r="30" fill="rgba(255,255,255,0.15)"/>` +
    `</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────

export function GenerationWorkbench() {

  const [tab, setTab] = useState<string>('create');
  const [meta, setMeta] = useState<GenerationMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // -- Formulaire "Nouvelle génération"
  const [userId, setUserId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [model, setModel] = useState<string>('');
  const [resolution, setResolution] = useState<string>('1024:1024');
  const [style, setStyle] = useState<string>('photorealistic');
  const [count, setCount] = useState(1);
  const [useSeed, setUseSeed] = useState(false);
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000));

  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  // -- Historique
  const [history, setHistory] = useState<HistoryImage[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // -- Paramètres (persistés localement)
  const [defaultModel, setDefaultModel] = useState('');
  const [defaultResolution, setDefaultResolution] = useState('1024:1024');
  const [defaultStyle, setDefaultStyle] = useState('photorealistic');
  const [paramsSaved, setParamsSaved] = useState(false);

  const resultRef = useRef<HTMLDivElement | null>(null);

  // Chargement des métadonnées (modèles / résolutions / styles)
  useEffect(() => {
    setUserId(getUserId());
    const run = async () => {
      setMetaLoading(true);
      setMetaError(null);
      try {
        const res = await fetch('/api/generation?mode=meta', {
          headers: authHeaders(),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const json = await res.json();
        if (json.success && json.data) {
          setMeta(json.data);
        } else {
          throw new Error(json.error || 'Réponse invalide');
        }
      } catch (e) {
        setMetaError(e instanceof Error ? e.message : 'Échec de chargement des options');
      } finally {
        setMetaLoading(false);
      }
    };
    run();
  }, []);

  // Application des défauts (métadonnées disponibles ou défauts locaux)
  const effectiveMeta = useMemo(() => {
    if (meta) return meta;
    return {
      models: [],
      resolutions: [
        { key: '1024:1024', label: '1024 × 1024 (carré)', width: 1024, height: 1024 },
        { key: '1920:1080', label: '1920 × 1080 (paysage)', width: 1920, height: 1080 },
        { key: '1080:1920', label: '1080 × 1920 (portrait)', width: 1080, height: 1920 },
      ],
      styles: [
        { key: 'photorealistic', label: 'Photorealistic' },
        { key: 'anime', label: 'Anime' },
        { key: 'digital-art', label: 'Digital Art' },
        { key: 'cinematic', label: 'Cinematic' },
      ],
    } as GenerationMeta;
  }, [meta]);

  // Initialiser les sélecteurs une fois les modèles connus
  useEffect(() => {
    if (!meta || meta.models.length === 0) return;
    setModel((m) => m || defaultModel || meta.models[0]?.label || '');
    setResolution((r) => r || defaultResolution);
    setStyle((s) => s || defaultStyle);
  }, [meta, defaultModel, defaultResolution, defaultStyle]);

  // Chargement des paramètres locaux
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('gen3ia_generation_settings');
      if (raw) {
        const s = JSON.parse(raw);
        setDefaultModel(s.model || '');
        setDefaultResolution(s.resolution || '1024:1024');
        setDefaultStyle(s.style || 'photorealistic');
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Chargement de l'historique (au montage + quand l'onglet devient actif + changement de page)
  const loadHistory = useCallback(
    async (page: number) => {
      const uid = userId || (await Promise.resolve(getUserId()));
      if (!uid) {
        setHistoryError('Utilisateur non identifié');
        setHistoryLoading(false);
        return;
      }
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const res = await fetch(
          `/api/generation?userId=${encodeURIComponent(uid)}&page=${page}&limit=24`,
          { headers: authHeaders(), cache: 'no-store' },
        );
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const json = (await res.json()) as { success: boolean; data?: HistoryResponse; error?: string };
        if (json.success && json.data) {
          setHistory(json.data.images);
          setTotalPages(json.data.pagination.totalPages || 1);
        } else {
          throw new Error(json.error || 'Réponse invalide');
        }
      } catch (e) {
        setHistoryError(e instanceof Error ? e.message : 'Échec du chargement de l’historique');
      } finally {
        setHistoryLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    if (tab === 'history' && userId) {
      loadHistory(historyPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, userId, historyPage]);

  // ─── Génération ─────────────────────────────────────────────
  const handleGenerate = async () => {
    const uid = userId || getUserId();
    if (!uid) {
      setGenError('Identifiant utilisateur introuvable. Connectez-vous pour générer.');
      return;
    }
    if (!prompt.trim()) {
      setGenError('Veuillez saisir un prompt.');
      return;
    }
    if (prompt.trim().length > 1000) {
      setGenError('Le prompt est trop long (1000 caractères max).');
      return;
    }

    setIsGenerating(true);
    setGenError(null);
    setDemoMode(false);

    const body: Record<string, unknown> = {
      userId: uid,
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim(),
      model,
      resolution,
      style,
      count,
    };
    if (useSeed) body.seed = Math.max(0, Math.floor(seed));

    try {
      const res = await fetch('/api/generation', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const message = json?.error || `Erreur ${res.status}`;
        // Fallback "mode démo" : on ne bloque pas la démo.
        const fallback = Array.from({ length: count }, (_, i) => {
          const w = (effectiveMeta.resolutions.find((r) => r.key === resolution)?.width) || 1024;
          const h = (effectiveMeta.resolutions.find((r) => r.key === resolution)?.height) || 1024;
          const s = useSeed ? seed + i : Math.floor(Math.random() * 1_000_000);
          return {
            id: `demo-${Date.now()}-${i}`,
            imageUrl: makeDemoImage(prompt.trim(), w, h, s),
            model,
            width: w,
            height: h,
          };
        });
        setResults(fallback);
        setDemoMode(true);
        setGenError(
          `${message}. Résultat affiché en mode démo (la clé Hugging Face est absente ou le service est indisponible).`,
        );
        setIsGenerating(false);
        return;
      }

      const json = await res.json();
      if (json.success && json.data?.results?.length) {
        setResults(json.data.results);
        setDemoMode(false);
        setGenError(null);
        // Rafraîchit l'historique en arrière-plan
        if (uid) setTimeout(() => loadHistory(1), 400);
      } else {
        setResults([]);
        setGenError(json.error || 'Aucune image générée');
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Erreur inattendue lors de la génération');
    } finally {
      setIsGenerating(false);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const randomizeSeed = () => setSeed(Math.floor(Math.random() * 1_000_000));

  const downloadImage = (href: string | undefined, index: number) => {
    if (!href) return;
    const link = document.createElement('a');
    link.href = href;
    link.download = `gen3ia-${Date.now()}-${index + 1}.png`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  };

  const saveSettings = () => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        'gen3ia_generation_settings',
        JSON.stringify({
          model: defaultModel || model,
          resolution: defaultResolution,
          style: defaultStyle,
        }),
      );
    } catch {
      /* ignore */
    }
    setParamsSaved(true);
    setTimeout(() => setParamsSaved(false), 2000);
  };

  const resetSettings = () => {
    setDefaultModel('');
    setDefaultResolution('1024:1024');
    setDefaultStyle('photorealistic');
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('gen3ia_generation_settings');
      } catch {
        /* ignore */
      }
    }
  };

  const resolutionLabel = (key: string): string =>
    effectiveMeta.resolutions.find((r) => r.key === key)?.label || key;

  // ─── Rendu ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Bandeau d'en-tête */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-600 text-primary-foreground shadow-sm sm:flex">
            <Wand2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Génération{' '}
              <span className="bg-gradient-to-r from-primary via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent">
                d'images
              </span>
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Interface de travail — générez des images par intelligence artificielle
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {meta ? (
            <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
              <Layers className="h-3.5 w-3.5" />
              {meta.models.length} modèle(s) · {meta.resolutions.length} résolution(s)
            </Badge>
          ) : (
            <Skeleton className="h-7 w-36 rounded-full" />
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="w-full gap-1 p-1 sm:w-auto">
          <TabsTrigger value="create" className="gap-1.5">
            <Wand2 className="h-4 w-4" /> Nouvelle génération
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" /> Historique
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 className="h-4 w-4" /> Paramètres
          </TabsTrigger>
        </TabsList>

        {/* ≈≈≈≈≈≈ Onglet "Nouvelle génération" ≈≈≈≈≈≈ */}
        <TabsContent value="create" className="mt-4 space-y-4">
          <div className="grid gap-6 lg:grid-cols-[5fr_6fr]">
            {/* Formulaire */}
            <Card className="overflow-hidden shadow-sm">
              <div className="h-1.5 bg-gradient-to-r from-primary via-fuchsia-500 to-indigo-500" />
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <SlidersHorizontal className="h-4 w-4 text-primary" /> Nouvelle génération
                </CardTitle>
                <CardDescription>
                  Décrivez ce que vous voulez générer, puis lancez la génération.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prompt" className="flex items-center gap-1.5">
                    <Wand2 className="h-3.5 w-3.5 text-primary" /> Prompt
                  </Label>
                  <Textarea
                    id="prompt"
                    placeholder="Decrivez ce que vous voulez générer..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isGenerating}
                    className="min-h-28 resize-y bg-card focus-visible:ring-2"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Le prompt alimente le modèle, plus il est précis, meilleur est le rendu.</span>
                    <span className={prompt.length > 900 ? 'font-semibold text-amber-600' : ''}>
                      {prompt.length}/1000
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="negative-prompt" className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" /> Prompt négatif (optionnel)
                  </Label>
                  <Input
                    id="negative-prompt"
                    placeholder="Ce que l’image doit éviter..."
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    disabled={isGenerating}
                  />
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Modèle</Label>
                    <Select value={model} onValueChange={setModel} disabled={isGenerating || metaLoading}>
                      <SelectTrigger className="w-full focus-visible:ring-2">
                        <SelectValue placeholder={metaLoading ? 'Chargement…' : 'Choisir un modèle'} />
                      </SelectTrigger>
                      <SelectContent>
                        {effectiveMeta.models.map((m) => (
                          <SelectItem key={m.hfId} value={m.label}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {metaLoading && <p className="text-xs text-muted-foreground">Chargement des modèles…</p>}
                  </div>

                  <div className="space-y-2">
                    <Label>Résolution</Label>
                    <Select value={resolution} onValueChange={setResolution} disabled={isGenerating}>
                      <SelectTrigger className="w-full focus-visible:ring-2">
                        <SelectValue placeholder="Choisir une résolution" />
                      </SelectTrigger>
                      <SelectContent>
                        {effectiveMeta.resolutions.map((r) => (
                          <SelectItem key={r.key} value={r.key}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Style</Label>
                    <Select value={style} onValueChange={setStyle} disabled={isGenerating}>
                      <SelectTrigger className="w-full focus-visible:ring-2">
                        <SelectValue placeholder="Choisir un style" />
                      </SelectTrigger>
                      <SelectContent>
                        {effectiveMeta.styles.map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="count">Nombre d’images (1 – 4)</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setCount((c) => Math.max(1, c - 1))}
                        disabled={isGenerating || count <= 1}
                        aria-label="Réduire"
                      >
                        −
                      </Button>
                      <Input
                        id="count"
                        type="number"
                        min={1}
                        max={4}
                        value={count}
                        onChange={(e) => setCount(Math.min(4, Math.max(1, Number(e.target.value) || 1)))}
                        disabled={isGenerating}
                        className="text-center"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setCount((c) => Math.min(4, c + 1))}
                        disabled={isGenerating || count >= 4}
                        aria-label="Augmenter"
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="seed" className="flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" /> Graine (seed)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="seed"
                        type="number"
                        min={0}
                        value={useSeed ? seed : ''}
                        placeholder="Aléatoire"
                        onChange={(e) => setSeed(Number(e.target.value) || 0)}
                        disabled={isGenerating || !useSeed}
                        className="font-mono focus-visible:ring-2"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={randomizeSeed}
                        disabled={isGenerating || !useSeed}
                        title="Graine aléatoire"
                        aria-label="Graine aléatoire"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm">
                    <input
                      id="use-seed"
                      type="checkbox"
                      checked={useSeed}
                      onChange={(e) => setUseSeed(e.target.checked)}
                      disabled={isGenerating}
                      className="size-4 accent-primary"
                    />
                    <label htmlFor="use-seed" className="cursor-pointer select-none">
                      Utiliser une graine fixe
                    </label>
                  </div>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={ isGenerating || (!prompt.trim() && !demoMode)}
                  size="lg"
                  className="w-full bg-gradient-to-r from-primary via-fuchsia-600 to-indigo-600 font-semibold shadow-md hover:from-primary hover:via-fuchsia-500 hover:to-indigo-500 hover:shadow-lg disabled:from-muted disabled:via-muted disabled:to-muted"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Génération en cours…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" /> Générer
                    </>
                  )}
                </Button>

                {genError && (
                  <div
                    role={demoMode ? 'status' : 'alert'}
                    className={
                      demoMode
                        ? 'flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                        : 'flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200'
                    }
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{genError}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Aperçu des générations */}
            <Card ref={resultRef} className="scroll-mt-6 overflow-hidden shadow-sm">
              <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-primary" />
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImagePlus className="h-4 w-4 text-primary" /> Aperçu des générations
                </CardTitle>
                <CardDescription>
                  {results.length > 0
                    ? `${results.length} image(s) générée(s) — grille ci-dessous`
                    : 'Les images générées apparaîtront ici.'}
                  {demoMode && <Badge className="ml-2 gap-1 bg-amber-500"><AlertTriangle className="h-3 w-3" /> Mode démo</Badge>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isGenerating && results.length === 0 ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {Array.from({ length: count }).map((_, i) => (
                      <Skeleton key={i} className="aspect-square w-full rounded-xl" />
                    ))}
                  </div>
                ) : results.length === 0 ? (
                  <div className="relative flex min-h-64 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                    <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
                    <div className="absolute -bottom-12 -right-10 h-44 w-44 rounded-full bg-fuchsia-500/10 blur-3xl" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-fuchsia-500/15 ring-1 ring-border">
                      <ImagePlus className="h-8 w-8 text-primary/60" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground/80">Aucune génération</p>
                    <p className="mt-1 max-w-xs text-xs">
                      Remplissez un prompt puis cliquez sur « Générer ». Votre création apparaîtra dans cette grille.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {results.map((img, i) => (
                      <Card key={`${img.id || 'gen'}-${i}`} className="group overflow-hidden shadow-none ring-1 ring-border/60">
                        <div className="relative overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.imageUrl}
                            alt={`Génération ${i + 1}`}
                            className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 via-transparent to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="gap-1.5 shadow"
                              onClick={() => downloadImage(img.imageUrl, i)}
                            >
                              <Download className="h-4 w-4" /> Télécharger
                            </Button>
                          </div>
                        </div>
                        <CardContent className="space-y-2 p-3">
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="gap-1">
                              <Layers className="h-3 w-3" /> {img.model || 'Modèle'}
                            </Badge>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {img.width} × {img.height}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => downloadImage(img.imageUrl, i)}
                          >
                            <Download className="mr-2 h-4 w-4" /> Télécharger
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ≈≈≈≈≈≈ Onglet "Historique" ≈≈≈≈≈≈ */}
        <TabsContent value="history" className="mt-4 space-y-4">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-primary" /> Historique des générations
              </CardTitle>
              <CardDescription>
                Vos générations récentes, de la plus récente à la plus ancienne.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="overflow-hidden rounded-xl ring-1 ring-border/60">
                      <Skeleton className="aspect-square w-full rounded-none" />
                      <div className="space-y-2 p-3">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : historyError ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    {historyError}
                    {!userId && (
                      <p className="mt-2 text-xs">
                        Aucun utilisateur connecté — connectez-vous pour voir votre historique.
                      </p>
                    )}
                  </div>
                </div>
              ) : history.length === 0 ? (
                <div className="relative flex min-h-48 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-fuchsia-500/15 ring-1 ring-border">
                    <History className="h-7 w-7 text-primary/60" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-foreground/80">Aucune génération</p>
                  <p className="mt-1 max-w-sm text-xs">
                    Lancez votre première création dans l’onglet « Nouvelle génération ».
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {history.map((item) => (
                      <Card key={item.id} className="group overflow-hidden shadow-none ring-1 ring-border/60">
                        <div className="relative overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.imageUrl || ''}
                            alt={item.prompt}
                            className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        </div>
                        <CardContent className="space-y-2 p-3">
                          <p className="line-clamp-2 text-sm font-medium">{item.prompt || 'Sans prompt'}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={item.status === 'completed' ? 'default' : 'destructive'} className="gap-1">
                              {item.status === 'completed' ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <AlertTriangle className="h-3 w-3" />
                              )}
                              {item.status === 'completed' ? 'Complété' : 'Échec'}
                            </Badge>
                            <Badge variant="secondary">{item.model || '—'}</Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                            <span>
                              {item.width} × {item.height}
                            </span>
                            <span>
                              {new Date(item.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="mt-5 flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        disabled={historyPage <= 1 || historyLoading}
                      >
                        Précédent
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {historyPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                        disabled={historyPage >= totalPages || historyLoading}
                      >
                        Suivant
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ≈≈≈≈≈≈ Onglet "Paramètres" ≈≈≈≈≈≈ */}
        <TabsContent value="settings" className="mt-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4 text-primary" /> Paramètres par défaut
              </CardTitle>
              <CardDescription>
                Les valeurs par défaut appliquées à vos prochaines générations (enregistrées localement sur ce navigateur).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Modèle par défaut</Label>
                  <Select value={defaultModel || model} onValueChange={setDefaultModel}>
                    <SelectTrigger className="w-full focus-visible:ring-2">
                      <SelectValue placeholder="Choisir" />
                    </SelectTrigger>
                    <SelectContent>
                      {effectiveMeta.models.map((m) => (
                        <SelectItem key={m.hfId} value={m.label}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Résolution par défaut</Label>
                  <Select value={defaultResolution} onValueChange={setDefaultResolution}>
                    <SelectTrigger className="w-full focus-visible:ring-2">
                      <SelectValue placeholder="Choisir" />
                    </SelectTrigger>
                    <SelectContent>
                      {effectiveMeta.resolutions.map((r) => (
                        <SelectItem key={r.key} value={r.key}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{resolutionLabel(defaultResolution)}</p>
                </div>
                <div className="space-y-2">
                  <Label>Style par défaut</Label>
                  <Select value={defaultStyle} onValueChange={setDefaultStyle}>
                    <SelectTrigger className="w-full focus-visible:ring-2">
                      <SelectValue placeholder="Choisir" />
                    </SelectTrigger>
                    <SelectContent>
                      {effectiveMeta.styles.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {metaLoading && (
                <p className="text-sm text-muted-foreground">Chargement des options disponibles…</p>
              )}
              {metaError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{metaError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={saveSettings}>
                  <Copy className="mr-2 h-4 w-4" /> Enregistrer les paramètres
                </Button>
                <Button variant="outline" onClick={resetSettings}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Réinitialiser
                </Button>
                {paramsSaved && (
                  <Badge className="gap-1 bg-green-500">
                    <CheckCircle2 className="h-3 w-3" /> Paramètres enregistrés
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}