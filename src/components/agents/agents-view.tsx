'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { AgentCard } from './agent-card';
import { AgentCreateDialog } from './agent-create-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Plus, Bot, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface Agent {
  id: string;
  name: string;
  type: string;
  description: string;
  status: string;
  config: string;
  avatar?: string | null;
  _count?: { tasks: number };
}

export function AgentsView() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/agents?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleToggle = async (id: string) => {
    try {
      const res = await fetch(`/api/agents/${id}/toggle`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status: updated.status } : a)));
        toast({
          title: updated.status === 'active' ? 'Agent activé' : 'Agent désactivé',
          description: `L'agent a été ${updated.status === 'active' ? 'activé' : 'désactivé'}`,
        });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors du changement de statut', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/agents/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.id !== deleteId));
        toast({ title: 'Agent supprimé', description: 'L\'agent a été supprimé' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors de la suppression', variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditAgent(agent);
    setCreateOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Vos Agents IA</h2>
          <p className="text-sm text-muted-foreground">{agents.length} agent(s) configuré(s)</p>
        </div>
        <Button className="gap-2" onClick={() => { setEditAgent(null); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" />
          Créer un agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Aucun agent"
          description="Créez votre premier agent IA pour commencer à automatiser vos tâches"
          actionLabel="Créer un agent"
          onAction={() => { setEditAgent(null); setCreateOpen(true); }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onToggle={handleToggle}
              onDelete={setDeleteId}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      <AgentCreateDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setEditAgent(null);
        }}
        onSuccess={loadAgents}
        editAgent={editAgent}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet agent ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Toutes les tâches associées seront également supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
