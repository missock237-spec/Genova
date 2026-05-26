'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowCard } from './workflow-card';
import { WorkflowBuilder } from './workflow-builder';
import { WorkflowExecution } from './workflow-execution';
import { EmptyState } from '@/components/shared/empty-state';
import { Plus, GitBranch, Loader2, Trash2, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Agent {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface WorkflowData {
  id: string;
  name: string;
  description: string;
  status: string;
  steps: string;
  trigger: string;
  _count?: { tasks: number };
  createdAt: string;
  updatedAt: string;
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    agent?: { name: string; type: string } | null;
  }>;
}

export function CoordinationView() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewWorkflow, setViewWorkflow] = useState<WorkflowData | null>(null);
  const [activeTab, setActiveTab] = useState('list');

  // Create form
  const [form, setForm] = useState({
    name: '',
    description: '',
    steps: [{ title: '', description: '', agentId: '', priority: 'medium' }] as Array<{ title: string; description: string; agentId: string; priority: string }>,
  });

  const loadWorkflows = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/workflows?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data);
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

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
    }
  }, [user?.id]);

  useEffect(() => {
    loadWorkflows();
    loadAgents();
  }, [loadWorkflows, loadAgents]);

  const addStep = () => {
    setForm((prev) => ({
      ...prev,
      steps: [...prev.steps, { title: '', description: '', agentId: '', priority: 'medium' }],
    }));
  };

  const removeStep = (index: number) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }));
  };

  const updateStep = (index: number, field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      toast({ title: 'Erreur', description: 'Nom du workflow requis', variant: 'destructive' });
      return;
    }

    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          steps: form.steps,
          trigger: { type: 'manual' },
          userId: user?.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({ title: 'Erreur', description: data.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'Workflow créé', description: `${form.name} a été créé avec succès` });
      setCreateOpen(false);
      setForm({ name: '', description: '', steps: [{ title: '', description: '', agentId: '', priority: 'medium' }] });
      loadWorkflows();
    } catch {
      toast({ title: 'Erreur', description: 'Erreur serveur', variant: 'destructive' });
    }
  };

  const handleExecute = async (id: string) => {
    try {
      const res = await fetch(`/api/workflows/${id}/execute`, { method: 'POST' });
      if (res.ok) {
        toast({ title: 'Workflow exécuté', description: 'Les tâches ont été créées' });
        loadWorkflows();
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors de l\'exécution', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/workflows/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setWorkflows((prev) => prev.filter((w) => w.id !== deleteId));
        toast({ title: 'Workflow supprimé' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors de la suppression', variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  const handleView = async (workflow: WorkflowData) => {
    try {
      const res = await fetch(`/api/workflows/${workflow.id}`);
      if (res.ok) {
        const data = await res.json();
        setViewWorkflow(data);
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors du chargement', variant: 'destructive' });
    }
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
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Coordination multi-agents
          </h2>
          <p className="text-sm text-muted-foreground">{workflows.length} workflow(s) configuré(s)</p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouveau workflow
        </Button>
      </div>

      {viewWorkflow ? (
        <div className="space-y-4">
          <Button variant="outline" onClick={() => setViewWorkflow(null)}>
            ← Retour aux workflows
          </Button>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="list">Vue d&apos;ensemble</TabsTrigger>
              <TabsTrigger value="builder">Constructeur</TabsTrigger>
              <TabsTrigger value="execution">Exécution</TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="mt-4">
              <Card className="border-border/50 p-4">
                <h3 className="font-semibold mb-2">{viewWorkflow.name}</h3>
                <p className="text-sm text-muted-foreground mb-3">{viewWorkflow.description}</p>
                <div className="flex gap-2">
                  <Badge variant="outline">{viewWorkflow.status}</Badge>
                  <Button size="sm" className="gap-1" onClick={() => handleExecute(viewWorkflow.id)}>
                    <Play className="h-3 w-3" /> Exécuter
                  </Button>
                </div>
              </Card>
            </TabsContent>
            <TabsContent value="builder" className="mt-4">
              <WorkflowBuilder
                steps={JSON.parse(viewWorkflow.steps || '[]')}
                workflowName={viewWorkflow.name}
                workflowStatus={viewWorkflow.status}
              />
            </TabsContent>
            <TabsContent value="execution" className="mt-4">
              <WorkflowExecution
                workflowName={viewWorkflow.name}
                tasks={viewWorkflow.tasks || []}
              />
            </TabsContent>
          </Tabs>
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Aucun workflow"
          description="Créez des workflows pour coordonner vos agents IA dans des processus automatisés"
          actionLabel="Créer un workflow"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              onExecute={handleExecute}
              onDelete={setDeleteId}
              onView={handleView}
            />
          ))}
        </div>
      )}

      {/* Create Workflow Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Créer un workflow</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du workflow</Label>
              <Input
                placeholder="Ex: Campagne de prospection"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Décrivez l'objectif du workflow..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Étapes</Label>
                <Button type="button" variant="outline" size="sm" onClick={addStep}>
                  <Plus className="h-3 w-3 mr-1" /> Ajouter
                </Button>
              </div>

              {form.steps.map((step, i) => (
                <div key={i} className="p-3 rounded-lg border border-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-primary">Étape {i + 1}</span>
                    {form.steps.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeStep(i)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Input
                    placeholder="Titre de l'étape"
                    value={step.title}
                    onChange={(e) => updateStep(i, 'title', e.target.value)}
                  />
                  <Input
                    placeholder="Description (optionnel)"
                    value={step.description}
                    onChange={(e) => updateStep(i, 'description', e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={step.agentId}
                      onValueChange={(value) => updateStep(i, 'agentId', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={step.priority}
                      onValueChange={(value) => updateStep(i, 'priority', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Basse</SelectItem>
                        <SelectItem value="medium">Moyenne</SelectItem>
                        <SelectItem value="high">Haute</SelectItem>
                        <SelectItem value="critical">Critique</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button type="submit">Créer le workflow</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce workflow ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Toutes les tâches associées seront supprimées.
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
