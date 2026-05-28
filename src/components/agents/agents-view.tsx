'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AgentCard } from './agent-card';
import { AgentCreateDialog } from './agent-create-dialog';
import { AgentDetailView } from './agent-detail-view';
import { EmptyState } from '@/components/shared/empty-state';
import { Plus, Bot, Loader2, Search, Filter } from 'lucide-react';
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
import { apiFetch } from '@/lib/api';

interface Agent {
  id: string;
  name: string;
  type: string;
  description: string;
  status: string;
  config: string;
  avatar?: string | null;
  _count?: { tasks: number };
  permissions?: Array<{
    id: string;
    permission: string;
    granted: boolean;
    requiresApproval: boolean;
  }>;
}

export function AgentsView() {
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const loadAgents = useCallback(async () => {
    try {
      const data = await apiFetch<Agent[]>('/api/agents');
      setAgents(data);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleToggle = async (id: string) => {
    try {
      const updated = await apiFetch<{ status: string }>(`/api/agents/${id}/toggle`, {
        method: 'POST',
      });
      setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status: updated.status } : a)));
      if (selectedAgent?.id === id) {
        setSelectedAgent((prev) => prev ? { ...prev, status: updated.status } : null);
      }
      toast({
        title: updated.status === 'active' ? 'Agent activé' : 'Agent désactivé',
        description: `L'agent a été ${updated.status === 'active' ? 'activé' : 'désactivé'}`,
      });
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors du changement de statut', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/api/agents/${deleteId}`, { method: 'DELETE' });
      setAgents((prev) => prev.filter((a) => a.id !== deleteId));
      if (selectedAgent?.id === deleteId) {
        setSelectedAgent(null);
      }
      toast({ title: 'Agent supprimé', description: 'L\'agent a été supprimé' });
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

  const handleSelectAgent = (agent: Agent) => {
    setSelectedAgent(agent);
  };

  // Get unique types for filter
  const uniqueTypes = Array.from(new Set(agents.map((a) => a.type)));

  // Filter agents
  const filteredAgents = agents.filter((agent) => {
    const matchesSearch = !searchQuery ||
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || agent.status === statusFilter;
    const matchesType = typeFilter === 'all' || agent.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show detail view if an agent is selected
  if (selectedAgent) {
    return (
      <AgentDetailView
        agent={selectedAgent}
        onBack={() => setSelectedAgent(null)}
      />
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

      {/* Search & Filters */}
      {agents.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un agent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="active">Actif</SelectItem>
              <SelectItem value="inactive">Inactif</SelectItem>
            </SelectContent>
          </Select>
          {uniqueTypes.length > 1 && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {uniqueTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Aucun agent"
          description="Créez votre premier agent IA pour commencer à automatiser vos tâches"
          actionLabel="Créer un agent"
          onAction={() => { setEditAgent(null); setCreateOpen(true); }}
        />
      ) : filteredAgents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucun agent ne correspond à votre recherche</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onToggle={handleToggle}
              onDelete={setDeleteId}
              onEdit={handleEdit}
              onSelect={handleSelectAgent}
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
