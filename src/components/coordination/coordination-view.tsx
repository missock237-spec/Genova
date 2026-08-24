'use client';

import { useState, useEffect, useCallback } from 'react';
import { GitBranch, Plus, Play, Settings, Users, Loader2, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { WorkflowCreateDialog } from '@/components/coordination/workflow-create-dialog';

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'draft' | 'paused' | 'completed';
  stepCount: number;
  updatedAt: string;
  agentIds?: string[];
}

export function CoordinationView() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    setError(null);
    let lastErr: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch('/api/workflows');
        if (res.status === 401) { lastErr = 'Session expirée — reconnectez-vous'; break; }
        if (!res.ok) {
          let serverMsg = `Erreur ${res.status}`;
          try {
            const errBody = await res.json();
            if (errBody?.error) serverMsg = `${res.status}: ${errBody.error}`;
          } catch { /* ignore parse error */ }
          throw new Error(serverMsg);
        }
        const data = await res.json();
        const wfList = Array.isArray(data?.workflows) ? data.workflows : (Array.isArray(data) ? data : []);
        setWorkflows(wfList);
        lastErr = null;
        setHasLoadedOnce(true);
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : 'Erreur de chargement';
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    if (lastErr) {
      setError(lastErr);
      setWorkflows([]);
      setHasLoadedOnce(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let _cancelled = false;
    (async () => {
      if (!_cancelled) {
        try { await loadWorkflows(); } catch { /* handled inside */ }
      }
    })();
    return () => { _cancelled = true; };
  }, [loadWorkflows]);

  const handleExecute = async (id: string) => {
    setExecutingId(id);
    try {
      const res = await fetch(`/api/workflows/${id}/execute`, { method: 'POST' });
      if (res.ok) {
        setWorkflows(prev => prev.map(w => w.id === id ? { ...w, status: 'active' as const } : w));
      }
    } catch {}
    finally { setExecutingId(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce workflow définitivement ?')) return;
    try {
      await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
      setWorkflows(prev => prev.filter(w => w.id !== id));
    } catch {}
  };

  const statusConfig: Record<string, { label: string; class: string }> = {
    active: { label: 'Actif', class: 'bg-green-500/10 text-green-500' },
    draft: { label: 'Brouillon', class: 'bg-muted text-muted-foreground' },
    paused: { label: 'En pause', class: 'bg-yellow-500/10 text-yellow-500' },
    completed: { label: 'Terminé', class: 'bg-blue-500/10 text-blue-500' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" />
            Coordination
          </h1>
          <p className="text-muted-foreground">Workflows multi-agents — Orchestrez vos agents IA</p>
        </div>
        <Button className="flex items-center gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouveau workflow
        </Button>
      </div>

      {/* Erreur — distinct de l'état vide */}
      {error && hasLoadedOnce && (
        <Alert variant="destructive" className="relative">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm pr-20">
            {error}
          </AlertDescription>
          <Button
            variant="outline" size="sm"
            className="absolute right-3 top-1/2 -translate-y-1/2 h-8 gap-1.5 text-xs"
            onClick={loadWorkflows}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Réessayer
          </Button>
        </Alert>
      )}

      {loading && !hasLoadedOnce ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !error && workflows.length === 0 ? (
        /* État vide — seulement si PAS d'erreur */
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <GitBranch className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">Aucun workflow</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
            Créez votre premier workflow multi-agents pour automatiser vos processus
          </p>
          <Button variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Créer un workflow
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((wf) => {
            const status = statusConfig[wf.status] || statusConfig.draft;
            return (
              <div
                key={wf.id}
                className="bg-card rounded-xl border border-border p-5 hover:shadow-md hover:border-primary/20 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <GitBranch className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{wf.name}</h3>
                      <p className="text-xs text-muted-foreground">{wf.stepCount || 0} étape{(wf.stepCount || 0) > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.class}`}>
                    {status.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                  {wf.description || 'Aucune description'}
                </p>
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleExecute(wf.id)}
                      disabled={executingId === wf.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {executingId === wf.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      Exécuter
                    </button>
                    <button className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors" title="Paramètres">
                      <Settings className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors" title="Agents">
                      <Users className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => handleDelete(wf.id)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  Mis à jour le {new Date(wf.updatedAt).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <WorkflowCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadWorkflows}
      />
    </div>
  );
}
