'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Film,
  Image,
  Sparkles,
  Loader2,
  Play,
  Trash2,
  Download,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Video,
  ImageIcon,
  Settings2,
  RefreshCw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

interface VideoGen {
  id: string;
  prompt: string;
  model: string;
  provider: string;
  status: string;
  videoUrl: string | null;
  durationSeconds: number;
  fps: number;
  numFrames: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  metadata: string;
}

interface ImageGen {
  id: string;
  prompt: string;
  model: string;
  provider: string;
  status: string;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

const VIDEO_MODELS = [
  { id: 'cogvideo-2b', name: 'CogVideoX-2B', desc: '720x480 · 49 frames · 8 fps', provider: 'Local' },
  { id: 'videocrafter2', name: 'VideoCrafter2', desc: '512x320 · 16 frames · 28 fps', provider: 'Local' },
];

const IMAGE_MODELS = [
  { id: 'flux-1-schnell-free', name: 'Flux 1 Schnell', desc: 'Gratuit · Rapide' },
  { id: 'stable-diffusion-xl-free', name: 'Stable Diffusion XL', desc: 'Gratuit · Haute qualité' },
];

// ── Status Badge ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle2; className: string; label: string }> = {
    pending: { icon: Clock, className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', label: 'En attente' },
    processing: { icon: Loader2, className: 'bg-blue-500/10 text-blue-600 border-blue-500/20', label: 'Traitement' },
    completed: { icon: CheckCircle2, className: 'bg-green-500/10 text-green-600 border-green-500/20', label: 'Terminé' },
    failed: { icon: XCircle, className: 'bg-red-500/10 text-red-600 border-red-500/20', label: 'Échoué' },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <Badge className={`${c.className} text-[10px] gap-1`}>
      <Icon className={`h-3 w-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {c.label}
    </Badge>
  );
}

// ── Video Generator Tab ───────────────────────────────────────

function VideoGeneratorTab() {
  const { user } = useAuthStore();
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('cogvideo-2b');
  const [steps, setSteps] = useState(50);
  const [guidance, setGuidance] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [videos, setVideos] = useState<VideoGen[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch('/api/videos/generate', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('genova_token') || ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/videos/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('genova_token') || ''}`,
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          numInferenceSteps: steps,
          guidanceScale: guidance,
        }),
      });
      if (res.ok) {
        setPrompt('');
        await fetchVideos();
      } else {
        const err = await res.json().catch(() => ({ error: 'Erreur' }));
        alert(err.error || 'Erreur de génération');
      }
    } catch {
      alert('Erreur réseau');
    }
    setGenerating(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/videos/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('genova_token') || ''}` },
      });
      if (res.ok) fetchVideos();
    } catch { /* silent */ }
  };

  return (
    <div className="space-y-6">
      {/* Generator Form */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="h-5 w-5 text-primary" />
            Génération Vidéo IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Prompt</label>
            <Textarea
              placeholder="Décrivez la vidéo que vous souhaitez générer... (ex: Un coucher de soleil sur l'océan avec des vagues douces)"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[100px] resize-none"
              disabled={generating}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Modèle</label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{m.name}</span>
                        <span className="text-[10px] text-muted-foreground">{m.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Étapes: {steps}</label>
              <Slider value={[steps]} onValueChange={([v]) => setSteps(v)} min={10} max={100} step={5} className="mt-2" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Guidance: {guidance.toFixed(1)}</label>
              <Slider value={[guidance]} onValueChange={([v]) => setGuidance(v)} min={1} max={20} step={0.5} className="mt-2" />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="w-full sm:w-auto gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Générer la vidéo
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Video Gallery */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Film className="h-4 w-4" />
            Mes Vidéos ({videos.length})
          </h3>
          <Button variant="ghost" size="sm" onClick={fetchVideos} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Chargement...
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Film className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm">Aucune vidéo générée</p>
            <p className="text-xs mt-1">Créez votre première vidéo IA ci-dessus</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((video) => (
              <Card key={video.id} className="border-border/50 bg-card/50 overflow-hidden group">
                <div className="aspect-video bg-muted/30 relative flex items-center justify-center">
                  {video.status === 'completed' && video.videoUrl ? (
                    <video
                      src={video.videoUrl}
                      className="w-full h-full object-cover"
                      controls
                      muted
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      {video.status === 'processing' ? (
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      ) : video.status === 'failed' ? (
                        <AlertCircle className="h-8 w-8 text-red-500" />
                      ) : (
                        <Film className="h-8 w-8 text-muted-foreground/30" />
                      )}
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={video.status} />
                  </div>
                </div>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{video.prompt}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{video.model}</Badge>
                      <Badge variant="outline" className="text-[10px]">{video.provider}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      {video.videoUrl && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <a href={video.videoUrl} download>
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(video.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Image Generator Tab ───────────────────────────────────────

function ImageGeneratorTab() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('flux-1-schnell-free');
  const [generating, setGenerating] = useState(false);
  const [images, setImages] = useState<ImageGen[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchImages = useCallback(async () => {
    try {
      const res = await fetch('/api/images/generate', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('genova_token') || ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setImages(data.images || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('genova_token') || ''}`,
        },
        body: JSON.stringify({ prompt: prompt.trim(), model }),
      });
      if (res.ok) {
        setPrompt('');
        await fetchImages();
      } else {
        const err = await res.json().catch(() => ({ error: 'Erreur' }));
        alert(err.error || 'Erreur de génération');
      }
    } catch {
      alert('Erreur réseau');
    }
    setGenerating(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/images/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('genova_token') || ''}` },
      });
      if (res.ok) fetchImages();
    } catch { /* silent */ }
  };

  return (
    <div className="space-y-6">
      {/* Generator Form */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-5 w-5 text-primary" />
            Génération d'Images IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Prompt</label>
            <Textarea
              placeholder="Décrivez l'image que vous souhaitez générer... (ex: Un paysage cyberpunk néon sous la pluie)"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[100px] resize-none"
              disabled={generating}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Modèle</label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{m.name}</span>
                        <span className="text-[10px] text-muted-foreground">{m.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} className="w-full sm:w-auto gap-2">
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Génération...</>
            ) : (
              <><Sparkles className="h-4 w-4" />Générer l'image</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Image Gallery */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Image className="h-4 w-4" />
            Mes Images ({images.length})
          </h3>
          <Button variant="ghost" size="sm" onClick={fetchImages} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />Actualiser
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />Chargement...
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Image className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm">Aucune image générée</p>
            <p className="text-xs mt-1">Créez votre première image IA ci-dessus</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((img) => (
              <Card key={img.id} className="border-border/50 bg-card/50 overflow-hidden group">
                <div className="aspect-square bg-muted/30 relative">
                  {img.status === 'completed' && img.imageUrl ? (
                    <img src={img.imageUrl} alt={img.prompt} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      {img.status === 'processing' || img.status === 'pending' ? (
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      ) : (
                        <AlertCircle className="h-6 w-6 text-red-500" />
                      )}
                    </div>
                  )}
                  <div className="absolute top-1.5 right-1.5">
                    <StatusBadge status={img.status} />
                  </div>
                </div>
                <CardContent className="p-2">
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{img.prompt}</p>
                  <div className="flex items-center justify-between mt-1">
                    <Badge variant="outline" className="text-[9px]">{img.model}</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(img.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main MediaView ────────────────────────────────────────────

export function MediaView() {
  const [activeTab, setActiveTab] = useState('video');

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" />
            Médias IA
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Générez des vidéos et des images avec l'intelligence artificielle
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Video className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Modèles vidéo</p>
              <p className="text-lg font-bold">2</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <ImageIcon className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Modèles image</p>
              <p className="text-lg font-bold">2</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Play className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Local API</p>
              <p className="text-lg font-bold text-green-600">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Settings2 className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Limite/heure</p>
              <p className="text-lg font-bold">5</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Video & Image */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="video" className="gap-1.5 flex-1 sm:flex-none">
            <Video className="h-4 w-4" />
            Vidéos
          </TabsTrigger>
          <TabsTrigger value="image" className="gap-1.5 flex-1 sm:flex-none">
            <Image className="h-4 w-4" />
            Images
          </TabsTrigger>
        </TabsList>
        <TabsContent value="video" className="mt-4">
          <VideoGeneratorTab />
        </TabsContent>
        <TabsContent value="image" className="mt-4">
          <ImageGeneratorTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
