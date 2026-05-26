'use client';

import { useEffect, useState } from 'react';
import { useAuthStore, useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/shared/stat-card';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { Bot, Play, Workflow, ShieldCheck, Plus, Wand2, GitBranch, Activity, Zap, Brain, Cpu, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardStats {
  activeAgents: number;
  runningTasks: number;
  todayValidations: number;
  activeWorkflows: number;
  totalAgents: number;
  totalTasks: number;
  totalWorkflows: number;
  totalGuardrails: number;
  recentActivities: Array<{
    id: string;
    action: string;
    details: string;
    category: string;
    createdAt: string;
  }>;
  tasksByStatus: Array<{ status: string; _count: { status: number } }>;
}

const AI_PROVIDERS = [
  { name: 'Groq', icon: Zap, status: 'active', color: 'text-orange-500', bgColor: 'bg-orange-500/10', description: 'Vitesse — Réponses rapides', models: ['LLaMA 3.3 70B', 'DeepSeek R1', 'Qwen QWQ 32B'] },
  { name: 'OpenRouter', icon: Brain, status: 'active', color: 'text-purple-500', bgColor: 'bg-purple-500/10', description: 'Intelligence — Raisonnement avancé', models: ['DeepSeek Chat', 'Qwen3 235B', 'Mistral 3.1', 'Gemma 3 27B'] },
];

export function DashboardView() {
  const { user } = useAuthStore();
  const { setCurrentView } = useAppStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [user?.id]);

  const loadStats = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/dashboard/stats?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-16 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Agents actifs"
          value={stats?.activeAgents || 0}
          icon={Bot}
          description={`${stats?.totalAgents || 0} agents au total`}
          trend={stats?.activeAgents ? `${Math.round(((stats.activeAgents) / Math.max(stats.totalAgents, 1)) * 100)}% actifs` : undefined}
        />
        <StatCard
          title="Tâches en cours"
          value={stats?.runningTasks || 0}
          icon={Play}
          description={`${stats?.totalTasks || 0} tâches au total`}
          className={stats?.runningTasks ? 'border-primary/30' : ''}
        />
        <StatCard
          title="Validations aujourd'hui"
          value={stats?.todayValidations || 0}
          icon={ShieldCheck}
        />
        <StatCard
          title="Workflows actifs"
          value={stats?.activeWorkflows || 0}
          icon={Workflow}
          description={`${stats?.totalWorkflows || 0} workflows au total`}
        />
      </div>

      {/* AI Router Status */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            Routeur IA — Fournisseurs actifs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {AI_PROVIDERS.map((provider, i) => (
              <motion.div
                key={provider.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-4 rounded-xl border border-border/50 bg-card"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-lg ${provider.bgColor}`}>
                    <provider.icon className={`h-5 w-5 ${provider.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{provider.name}</h4>
                      <Badge variant="outline" className="text-[9px] h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        Actif
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{provider.description}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {provider.models.map((model) => (
                    <div key={model} className="flex items-center gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-muted-foreground">{model}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-primary">Routage intelligent :</span> Le système choisit automatiquement le meilleur fournisseur selon le type de tâche (chat rapide, raisonnement, code, marketing, analyse, orchestration, validation).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actions rapides</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full justify-start gap-3"
              variant="outline"
              onClick={() => setCurrentView('agents')}
            >
              <Plus className="h-4 w-4 text-primary" />
              Créer un agent
            </Button>
            <Button
              className="w-full justify-start gap-3"
              variant="outline"
              onClick={() => setCurrentView('coordination')}
            >
              <GitBranch className="h-4 w-4 text-primary" />
              Nouveau workflow
            </Button>
            <Button
              className="w-full justify-start gap-3"
              variant="outline"
              onClick={() => setCurrentView('automation')}
            >
              <Wand2 className="h-4 w-4 text-primary" />
              Lancer une commande
            </Button>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Activité récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed activities={stats?.recentActivities || []} />
          </CardContent>
        </Card>
      </div>

      {/* Tasks by Status */}
      {stats?.tasksByStatus && stats.tasksByStatus.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Répartition des tâches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {['pending', 'running', 'completed', 'failed', 'validated'].map((status) => {
                const found = stats.tasksByStatus.find((t) => t.status === status);
                const count = found?._count.status || 0;
                const labels: Record<string, string> = {
                  pending: 'En attente',
                  running: 'En cours',
                  completed: 'Terminées',
                  failed: 'Échouées',
                  validated: 'Validées',
                };
                const colors: Record<string, string> = {
                  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
                  running: 'bg-primary/10 text-primary border-primary/20',
                  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                  failed: 'bg-red-500/10 text-red-600 border-red-500/20',
                  validated: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                };
                return (
                  <div
                    key={status}
                    className={`p-3 rounded-lg border text-center ${colors[status]}`}
                  >
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs mt-1">{labels[status]}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
