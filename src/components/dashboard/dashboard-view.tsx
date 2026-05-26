'use client';

import { useEffect, useState } from 'react';
import { useAuthStore, useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/shared/stat-card';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { Bot, Play, Workflow, ShieldCheck, Plus, Wand2, GitBranch, Activity } from 'lucide-react';

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
                  validated: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
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
