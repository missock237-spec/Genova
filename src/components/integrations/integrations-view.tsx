'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Workflow,
  Database,
  MessageSquare,
  RefreshCw,
  Plus,
  Play,
  Pause,
  Trash2,
  ExternalLink,
  Server,
  CheckCircle2,
  XCircle,
  Loader2,
  Brain,
  Zap,
  Activity,
  Search,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

interface N8NWorkflow {
  id?: string;
  name: string;
  active: boolean;
  nodes?: Array<{ name: string; type: string }>;
  createdAt?: string;
  updatedAt?: string;
  tags?: Array<{ name: string }>;
}

interface N8NExecution {
  id: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  status: string;
}

interface PocketBaseStatus {
  connected: boolean;
  status: string;
  collectionCount?: number;
  collections?: Array<{ name: string; type: string }>;
  message?: string;
}

interface MemoryRecord {
  id?: string;
  userId: string;
  agentId: string;
  memoryType: string;
  content: string;
  relevanceScore?: number;
  created?: string;
}

interface LearningRecord {
  id?: string;
  userId: string;
  agentId: string;
  category: string;
  pattern: string;
  response: string;
  confidence: number;
  usageCount: number;
}

// ── Component ─────────────────────────────────────────────────

export function IntegrationsView() {
  // n8n state
  const [n8nHealthy, setN8NHealthy] = useState<boolean | null>(null);
  const [workflows, setWorkflows] = useState<N8NWorkflow[]>([]);
  const [executions, setExecutions] = useState<N8NExecution[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);

  // PocketBase state
  const [pbStatus, setPBStatus] = useState<PocketBaseStatus | null>(null);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [learnings, setLearnings] = useState<LearningRecord[]>([]);
  const [loadingPB, setLoadingPB] = useState(false);

  // Search state
  const [memorySearch, setMemorySearch] = useState('');
  const [memoryAgentId, setMemoryAgentId] = useState('');

  // Create workflow dialog
  const [workflowName, setWorkflowName] = useState('');
  const [workflowTrigger, setWorkflowTrigger] = useState<'webhook' | 'schedule' | 'manual'>('webhook');
  const [workflowPrompt, setWorkflowPrompt] = useState('');
  const [workflowOutput, setWorkflowOutput] = useState<'text' | 'image' | 'email'>('text');
  const [workflowTarget, setWorkflowTarget] = useState('');
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // ── n8n functions ───────────────────────────────────────────

  const checkN8N = useCallback(async () => {
    try {
      const data = await apiFetch<{ data: N8NWorkflow[] }>('/api/n8n/workflows?limit=1');
      setN8NHealthy(true);
      return true;
    } catch {
      setN8NHealthy(false);
      return false;
    }
  }, []);

  const fetchWorkflows = useCallback(async () => {
    setLoadingWorkflows(true);
    try {
      const data = await apiFetch<{ data: N8NWorkflow[] }>('/api/n8n/workflows?limit=50');
      setWorkflows(data.data || []);
    } catch {
      setWorkflows([]);
    } finally {
      setLoadingWorkflows(false);
    }
  }, []);

  const fetchExecutions = useCallback(async () => {
    try {
      const data = await apiFetch<{ data: N8NExecution[] }>('/api/n8n/executions?limit=20');
      setExecutions(data.data || []);
    } catch {
      setExecutions([]);
    }
  }, []);

  const toggleWorkflow = async (id: string, currentlyActive: boolean) => {
    try {
      await apiFetch(`/api/n8n/workflows/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action: currentlyActive ? 'deactivate' : 'activate' }),
      });
      fetchWorkflows();
    } catch {
      // Silently fail
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    try {
      await apiFetch(`/api/n8n/workflows/${id}`, { method: 'DELETE' });
      fetchWorkflows();
    } catch {
      // Silently fail
    }
  };

  const handleCreateWorkflow = async () => {
    if (!workflowName || !workflowPrompt) return;
    setCreating(true);
    try {
      await apiFetch('/api/n8n/workflows', {
        method: 'POST',
        body: JSON.stringify({
          name: workflowName,
          agentConfig: {
            triggerType: workflowTrigger,
            prompt: workflowPrompt,
            outputType: workflowOutput,
            outputTarget: workflowTarget || undefined,
          },
        }),
      });
      setDialogOpen(false);
      setWorkflowName('');
      setWorkflowPrompt('');
      setWorkflowTarget('');
      fetchWorkflows();
    } catch {
      // Silently fail
    } finally {
      setCreating(false);
    }
  };

  // ── PocketBase functions ────────────────────────────────────

  const fetchPBStatus = useCallback(async () => {
    try {
      const data = await apiFetch<PocketBaseStatus>('/api/pocketbase/status');
      setPBStatus(data);
    } catch {
      setPBStatus({ connected: false, status: 'error', message: 'Failed to check status' });
    }
  }, []);

  const fetchMemories = useCallback(async () => {
    if (!memoryAgentId) return;
    setLoadingPB(true);
    try {
      const params: Record<string, string> = {
        userId: 'demo-user',
        agentId: memoryAgentId,
        limit: '50',
      };
      if (memorySearch) params.q = memorySearch;
      const data = await apiFetch<{ memories: MemoryRecord[]; total: number }>(
        `/api/pocketbase/memories`,
        { params }
      );
      setMemories(data.memories || []);
    } catch {
      setMemories([]);
    } finally {
      setLoadingPB(false);
    }
  }, [memoryAgentId, memorySearch]);

  const fetchLearnings = useCallback(async () => {
    if (!memoryAgentId) return;
    try {
      const data = await apiFetch<{ learnings: LearningRecord[]; total: number }>(
        `/api/pocketbase/learnings`,
        { params: { userId: 'demo-user', agentId: memoryAgentId } }
      );
      setLearnings(data.learnings || []);
    } catch {
      setLearnings([]);
    }
  }, [memoryAgentId]);

  // ── Initial load ────────────────────────────────────────────

  useEffect(() => {
    checkN8N();
    fetchPBStatus();
  }, [checkN8N, fetchPBStatus]);

  useEffect(() => {
    if (n8nHealthy) {
      fetchWorkflows();
      fetchExecutions();
    }
  }, [n8nHealthy, fetchWorkflows, fetchExecutions]);

  // ── Helpers ─────────────────────────────────────────────────

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-emerald-500';
      case 'error': return 'text-red-500';
      case 'running': return 'text-blue-500';
      case 'waiting': return 'text-amber-500';
      default: return 'text-muted-foreground';
    }
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Intégrations
          </h2>
          <p className="text-sm text-muted-foreground">
            Gérez les connexions aux services externes : n8n, PocketBase, WhatsApp
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => { checkN8N(); fetchPBStatus(); }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualiser
        </Button>
      </div>

      {/* Service Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* n8n Status */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${n8nHealthy ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                <Workflow className={`h-5 w-5 ${n8nHealthy ? 'text-emerald-500' : 'text-red-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">n8n Workflows</p>
                <div className="flex items-center gap-1.5">
                  {n8nHealthy === null ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : n8nHealthy ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {n8nHealthy === null ? 'Vérification...' : n8nHealthy ? 'Connecté' : 'Indisponible'}
                  </span>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                :5678
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* PocketBase Status */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${pbStatus?.connected ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                <Database className={`h-5 w-5 ${pbStatus?.connected ? 'text-emerald-500' : 'text-red-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">PocketBase</p>
                <div className="flex items-center gap-1.5">
                  {pbStatus === null ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : pbStatus.connected ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {pbStatus === null ? 'Vérification...' : pbStatus.connected
                      ? `${pbStatus.collectionCount || 0} collections`
                      : 'Indisponible'}
                  </span>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                :8090
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Baileys/WhatsApp Status */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <MessageSquare className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">WhatsApp (Baileys)</p>
                <div className="flex items-center gap-1.5">
                  <Server className="h-3 w-3 text-amber-500" />
                  <span className="text-xs text-muted-foreground">Service séparé</span>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                :8186
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="n8n" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="n8n" className="gap-1.5 text-xs">
            <Workflow className="h-3.5 w-3.5" />
            n8n Workflows
          </TabsTrigger>
          <TabsTrigger value="pocketbase" className="gap-1.5 text-xs">
            <Database className="h-3.5 w-3.5" />
            PocketBase
          </TabsTrigger>
          <TabsTrigger value="baileys" className="gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5" />
            WhatsApp
          </TabsTrigger>
        </TabsList>

        {/* ── n8n Tab ──────────────────────────────────────────── */}
        <TabsContent value="n8n" className="space-y-4">
          {!n8nHealthy ? (
            <Card className="border-border/50">
              <CardContent className="p-8 text-center">
                <Workflow className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <h3 className="font-medium mb-1">n8n non connecté</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Assurez-vous que n8n fonctionne sur le port 5678 et que N8N_API_KEY est configuré dans le fichier .env
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-2"
                  onClick={checkN8N}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Workflows Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Workflows ({workflows.length})
                </h3>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      Nouveau workflow
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Créer un workflow agent Genova</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label>Nom du workflow</Label>
                        <Input
                          value={workflowName}
                          onChange={(e) => setWorkflowName(e.target.value)}
                          placeholder="Ex: Campagne marketing auto"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Type de déclencheur</Label>
                        <Select value={workflowTrigger} onValueChange={(v) => setWorkflowTrigger(v as 'webhook' | 'schedule' | 'manual')}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="webhook">Webhook (API)</SelectItem>
                            <SelectItem value="schedule">Planifié (cron)</SelectItem>
                            <SelectItem value="manual">Manuel</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Prompt de l&apos;agent</Label>
                        <Textarea
                          value={workflowPrompt}
                          onChange={(e) => setWorkflowPrompt(e.target.value)}
                          placeholder="Décrivez ce que l'agent doit faire..."
                          rows={3}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Type de sortie</Label>
                        <Select value={workflowOutput} onValueChange={(v) => setWorkflowOutput(v as 'text' | 'image' | 'email')}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texte</SelectItem>
                            <SelectItem value="image">Image</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {workflowOutput === 'email' && (
                        <div className="space-y-2">
                          <Label>Adresse email cible</Label>
                          <Input
                            value={workflowTarget}
                            onChange={(e) => setWorkflowTarget(e.target.value)}
                            placeholder="destinataire@example.com"
                          />
                        </div>
                      )}
                      <Button
                        className="w-full gap-2"
                        onClick={handleCreateWorkflow}
                        disabled={creating || !workflowName || !workflowPrompt}
                      >
                        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {creating ? 'Création...' : 'Créer le workflow'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Workflows List */}
              {loadingWorkflows ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : workflows.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="p-8 text-center">
                    <Workflow className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Aucun workflow trouvé</p>
                  </CardContent>
                </Card>
              ) : (
                <ScrollArea className="max-h-96">
                  <div className="space-y-2">
                    {workflows.map((wf) => (
                      <Card key={wf.id} className="border-border/50 hover:border-border transition-colors">
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className={`p-1.5 rounded-md ${wf.active ? 'bg-emerald-500/10' : 'bg-muted'}`}>
                            <Workflow className={`h-4 w-4 ${wf.active ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{wf.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {wf.nodes?.length || 0} nœuds · {formatDate(wf.updatedAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge variant={wf.active ? 'default' : 'secondary'} className="text-[10px] h-5">
                              {wf.active ? 'Actif' : 'Inactif'}
                            </Badge>
                            {wf.tags?.map((tag) => (
                              <Badge key={tag.name} variant="outline" className="text-[10px] h-5">
                                {tag.name}
                              </Badge>
                            ))}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => wf.id && toggleWorkflow(wf.id, wf.active)}
                            >
                              {wf.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => wf.id && handleDeleteWorkflow(wf.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {/* Recent Executions */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  Exécutions récentes
                </h3>
                {executions.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Aucune exécution récente</p>
                ) : (
                  <ScrollArea className="max-h-64">
                    <div className="space-y-1.5">
                      {executions.map((exec) => (
                        <div key={exec.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-sm">
                          <div className={`w-2 h-2 rounded-full ${
                            exec.status === 'success' ? 'bg-emerald-500' :
                            exec.status === 'error' ? 'bg-red-500' :
                            exec.status === 'running' ? 'bg-blue-500' :
                            'bg-amber-500'
                          }`} />
                          <span className="flex-1 min-w-0 truncate font-mono text-xs">{exec.workflowId}</span>
                          <span className={`text-xs font-medium ${statusColor(exec.status)}`}>
                            {exec.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(exec.startedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── PocketBase Tab ───────────────────────────────────── */}
        <TabsContent value="pocketbase" className="space-y-4">
          {!pbStatus?.connected ? (
            <Card className="border-border/50">
              <CardContent className="p-8 text-center">
                <Database className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <h3 className="font-medium mb-1">PocketBase non connecté</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Assurez-vous que PocketBase fonctionne sur le port 8090 et que POCKETBASE_URL est configuré dans le fichier .env
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-2"
                  onClick={fetchPBStatus}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Collections Info */}
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    Collections PocketBase
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {pbStatus.collectionCount} collection(s) disponible(s)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {pbStatus.collections?.map((col) => (
                      <div key={col.name} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                        <div className="p-1 rounded bg-primary/10">
                          {col.name.includes('memor') ? (
                            <Brain className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Database className="h-3.5 w-3.5 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{col.name}</p>
                          <p className="text-[10px] text-muted-foreground">{col.type}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Agent Memories */}
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    Mémoires d&apos;agent
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Recherchez les mémoires stockées dans PocketBase
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="ID de l'agent"
                      value={memoryAgentId}
                      onChange={(e) => setMemoryAgentId(e.target.value)}
                      className="text-xs h-8"
                    />
                    <Input
                      placeholder="Recherche..."
                      value={memorySearch}
                      onChange={(e) => setMemorySearch(e.target.value)}
                      className="text-xs h-8"
                    />
                    <Button
                      size="sm"
                      className="gap-1.5 h-8"
                      onClick={() => { fetchMemories(); fetchLearnings(); }}
                      disabled={!memoryAgentId}
                    >
                      <Search className="h-3 w-3" />
                      Chercher
                    </Button>
                  </div>

                  {loadingPB ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : memories.length > 0 ? (
                    <ScrollArea className="max-h-64">
                      <div className="space-y-1.5">
                        {memories.map((mem) => (
                          <div key={mem.id} className="p-2 rounded-lg bg-muted/50 text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-[10px] h-4">
                                {mem.memoryType}
                              </Badge>
                              {mem.relevanceScore !== undefined && (
                                <span className="text-[10px] text-muted-foreground">
                                  Pertinence: {(mem.relevanceScore * 100).toFixed(0)}%
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                {formatDate(mem.created)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{mem.content}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : memoryAgentId ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Aucune mémoire trouvée</p>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">Entrez un ID d&apos;agent pour rechercher</p>
                  )}
                </CardContent>
              </Card>

              {/* Agent Learnings */}
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Apprentissages d&apos;agent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {learnings.length > 0 ? (
                    <ScrollArea className="max-h-64">
                      <div className="space-y-1.5">
                        {learnings.map((lrn) => (
                          <div key={lrn.id} className="p-2 rounded-lg bg-muted/50 text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-[10px] h-4">
                                {lrn.category}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                Confiance: {(lrn.confidence * 100).toFixed(0)}%
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                Utilisé: {lrn.usageCount}×
                              </span>
                            </div>
                            <p className="text-xs font-medium truncate">{lrn.pattern}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">{lrn.response}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : memoryAgentId ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Aucun apprentissage trouvé</p>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">Recherchez des mémoires pour voir les apprentissages</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── WhatsApp/Baileys Tab ─────────────────────────────── */}
        <TabsContent value="baileys" className="space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                WhatsApp via Baileys
              </CardTitle>
              <CardDescription className="text-xs">
                Service de messagerie WhatsApp utilisant la bibliothèque Baileys
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">Configuration du service</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Port du service</p>
                    <p className="font-mono">8186</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bibliothèque</p>
                    <p className="font-mono">@whiskeysockets/baileys</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Endpoint santé</p>
                    <p className="font-mono">/health</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Envoi de messages</p>
                    <p className="font-mono">POST /messages/send</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Points d&apos;API disponibles</h4>
                <div className="space-y-1.5">
                  {[
                    { method: 'GET', path: '/session/status', desc: 'Statut de la session WhatsApp' },
                    { method: 'GET', path: '/session/qr', desc: 'Code QR pour connexion' },
                    { method: 'POST', path: '/messages/send', desc: 'Envoyer un message texte' },
                    { method: 'POST', path: '/messages/send-media', desc: 'Envoyer un média' },
                    { method: 'POST', path: '/session/disconnect', desc: 'Déconnecter la session' },
                  ].map((endpoint) => (
                    <div key={endpoint.path} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50">
                      <Badge
                        variant={endpoint.method === 'GET' ? 'secondary' : 'default'}
                        className="text-[10px] h-5 font-mono"
                      >
                        {endpoint.method}
                      </Badge>
                      <code className="text-xs font-mono">{endpoint.path}</code>
                      <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">{endpoint.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  <strong>Note :</strong> Le service Baileys doit être démarré séparément via{' '}
                  <code className="bg-amber-500/20 px-1 py-0.5 rounded">services/start-baileys.js</code>.
                  Assurez-vous que le port 8186 est accessible.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="gap-2 w-full"
                onClick={() => {
                  window.open('http://localhost:8186/health', '_blank');
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Vérifier la santé du service Baileys
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
