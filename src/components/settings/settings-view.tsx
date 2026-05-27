'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Workflow, ShieldCheck, Clock, Settings, ToggleLeft, ToggleRight, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface Agent {
  id: string;
  name: string;
  type: string;
  description: string;
  status: string;
  createdAt: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
}

interface Guardrail {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  createdAt: string;
}

export function SettingsView() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [inactiveAgents, setInactiveAgents] = useState<Agent[]>([]);
  const [inactiveWorkflows, setInactiveWorkflows] = useState<Workflow[]>([]);
  const [inactiveGuardrails, setInactiveGuardrails] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [agentsRes, workflowsRes, guardrailsRes] = await Promise.all([
        fetch('/api/agents', { credentials: 'include' }),
        fetch('/api/workflows', { credentials: 'include' }),
        fetch('/api/guardrails', { credentials: 'include' }),
      ]);

      if (agentsRes.ok) {
        const agents: Agent[] = await agentsRes.json();
        setInactiveAgents(agents.filter(a => a.status !== 'active'));
      }
      if (workflowsRes.ok) {
        const workflows: Workflow[] = await workflowsRes.json();
        setInactiveWorkflows(workflows.filter(w => w.status !== 'active'));
      }
      if (guardrailsRes.ok) {
        const guardrails: Guardrail[] = await guardrailsRes.json();
        setInactiveGuardrails(guardrails.filter(g => !g.isActive));
      }
    } catch (error) {
      console.error('Failed to load settings data:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleAgent = async (id: string, currentStatus: string) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/agents/${id}/toggle`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const updated = await res.json();
        if (updated.status === 'active') {
          setInactiveAgents(prev => prev.filter(a => a.id !== id));
        } else {
          setInactiveAgents(prev => prev.map(a => a.id === id ? { ...a, status: updated.status } : a));
        }
        toast({ title: 'Statut modifié', description: `Agent ${updated.status === 'active' ? 'activé' : 'désactivé'}` });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de modifier le statut', variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteAgent = async (id: string) => {
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setInactiveAgents(prev => prev.filter(a => a.id !== id));
        toast({ title: 'Agent supprimé' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de supprimer', variant: 'destructive' });
    }
  };

  const handleToggleGuardrail = async (id: string) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/guardrails/${id}/toggle`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const updated = await res.json();
        if (updated.isActive) {
          setInactiveGuardrails(prev => prev.filter(g => g.id !== id));
        } else {
          setInactiveGuardrails(prev => prev.map(g => g.id === id ? { ...g, isActive: updated.isActive } : g));
        }
        toast({ title: 'Statut modifié', description: `Garde-fou ${updated.isActive ? 'activé' : 'désactivé'}` });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de modifier le statut', variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    try {
      const res = await fetch(`/api/workflows/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setInactiveWorkflows(prev => prev.filter(w => w.id !== id));
        toast({ title: 'Workflow supprimé' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de supprimer', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Paramètres du compte</h2>
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6"><div className="h-20 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    inactive: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
    draft: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    paused: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    archived: 'bg-red-500/10 text-red-600 border-red-500/20',
  };

  const statusLabels: Record<string, string> = {
    inactive: 'Inactif',
    draft: 'Brouillon',
    paused: 'En pause',
    archived: 'Archivé',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Paramètres du compte</h2>
      </div>

      {/* Account Info */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Informations du compte</CardTitle>
          <CardDescription>Votre profil et vos paramètres</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Nom</p>
              <p className="font-medium">{user?.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Plan</p>
              <Badge variant="outline" className="capitalize">{user?.plan}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inactive Resources */}
      <Tabs defaultValue="agents" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="agents" className="gap-2">
            <Bot className="h-4 w-4" />
            Agents inactifs
            {inactiveAgents.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs h-5">{inactiveAgents.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="workflows" className="gap-2">
            <Workflow className="h-4 w-4" />
            Workflows inactifs
            {inactiveWorkflows.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs h-5">{inactiveWorkflows.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="guardrails" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Garde-fous inactifs
            {inactiveGuardrails.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs h-5">{inactiveGuardrails.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Inactive Agents */}
        <TabsContent value="agents">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                Agents inactifs
              </CardTitle>
              <CardDescription>
                Les agents inactifs n&apos;apparaissent pas dans le tableau de bord. Activez-les ou supprimez-les ici.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {inactiveAgents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Aucun agent inactif</p>
                  <p className="text-xs mt-1">Tous vos agents sont actifs</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {inactiveAgents.map(agent => (
                      <motion.div
                        key={agent.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                            <Bot className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{agent.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-[10px] h-4 capitalize">{agent.type}</Badge>
                              <Badge variant="outline" className={`text-[10px] h-4 ${statusColors[agent.status] || ''}`}>
                                {statusLabels[agent.status] || agent.status}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs"
                            onClick={() => handleToggleAgent(agent.id, agent.status)}
                            disabled={togglingId === agent.id}
                          >
                            {togglingId === agent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ToggleRight className="h-3 w-3" />}
                            Activer
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteAgent(agent.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inactive Workflows */}
        <TabsContent value="workflows">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Workflow className="h-4 w-4 text-muted-foreground" />
                Workflows inactifs
              </CardTitle>
              <CardDescription>
                Workflows en brouillon, en pause ou archivés.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {inactiveWorkflows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Workflow className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Aucun workflow inactif</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {inactiveWorkflows.map(workflow => (
                      <motion.div
                        key={workflow.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                            <Workflow className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{workflow.name}</p>
                            <Badge variant="outline" className={`text-[10px] h-4 mt-0.5 ${statusColors[workflow.status] || ''}`}>
                              {statusLabels[workflow.status] || workflow.status}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteWorkflow(workflow.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inactive Guardrails */}
        <TabsContent value="guardrails">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                Garde-fous inactifs
              </CardTitle>
              <CardDescription>
                Les garde-fous désactivés ne protègent plus vos agents. Réactivez-les ici.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {inactiveGuardrails.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Aucun garde-fou inactif</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {inactiveGuardrails.map(guardrail => (
                      <motion.div
                        key={guardrail.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{guardrail.name}</p>
                            <Badge variant="outline" className="text-[10px] h-4 mt-0.5 capitalize">{guardrail.type}</Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-xs"
                          onClick={() => handleToggleGuardrail(guardrail.id)}
                          disabled={togglingId === guardrail.id}
                        >
                          {togglingId === guardrail.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ToggleLeft className="h-3 w-3" />}
                          Réactiver
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
