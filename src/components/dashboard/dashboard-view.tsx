'use client';

import { useEffect, useState } from 'react';
import { useAuthStore, useAppStore } from '@/lib/store';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/shared/stat-card';
import { ActivityFeed } from '@/components/shared/activity-feed';
import {
  Bot,
  Play,
  Workflow,
  ShieldCheck,
  Plus,
  Wand2,
  GitBranch,
  Activity,
  Megaphone,
  MessageCircle,
  Clock,
  Monitor,
  Server,
  Settings,
  CheckCircle2,
} from 'lucide-react';

interface DashboardStats {
  activeAgents: number;
  runningTasks: number;
  todayValidations: number;
  activeWorkflows: number;
  totalAgents: number;
  totalTasks: number;
  totalWorkflows: number;
  totalGuardrails: number;
  socialAccounts: number;
  pendingApprovals: number;
  browserSessions: number;
  whatsappActive: boolean;
  whatsappAutoMessage: boolean;
  whatsappAutoCall: boolean;
  totalResources: number;
  recentActivities: Array<{
    id: string;
    action: string;
    details: string;
    category: string;
    createdAt: string;
  }>;
  tasksByStatus: Array<{ status: string; _count: { status: number } }>;
  socialAccountsByPlatform: Array<{ platform: string; _count: { platform: number } }>;
  resourcesByType: Array<{ type: string; _count: { type: number } }>;
  recentApprovals: Array<{
    id: string;
    agentId: string;
    action: string;
    details: string;
    status: string;
    createdAt: string;
  }>;
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
    try {
      const data = await apiFetch<DashboardStats>('/api/dashboard/stats');
      setStats(data);
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
      {/* Stats Cards - Row 1 */}
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
          title="Réseaux sociaux"
          value={stats?.socialAccounts || 0}
          icon={Megaphone}
          description={stats?.whatsappActive ? 'WhatsApp actif' : 'WhatsApp inactif'}
        />
        <StatCard
          title="Approbations"
          value={stats?.pendingApprovals || 0}
          icon={Clock}
          description="En attente"
          className={stats?.pendingApprovals ? 'border-amber-500/30' : ''}
        />
      </div>

      {/* Stats Cards - Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Navigateurs actifs"
          value={stats?.browserSessions || 0}
          icon={Monitor}
          description="Sessions navigateur"
        />
        <StatCard
          title="Ressources"
          value={stats?.totalResources || 0}
          icon={Server}
          description="Ressources configurées"
        />
        <StatCard
          title="Validations aujourd'hui"
          value={stats?.todayValidations || 0}
          icon={ShieldCheck}
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
            <Button
              className="w-full justify-start gap-3"
              variant="outline"
              onClick={() => setCurrentView('settings')}
            >
              <Settings className="h-4 w-4 text-primary" />
              Configurer les réseaux
            </Button>
            {stats && stats.pendingApprovals > 0 && (
              <Button
                className="w-full justify-start gap-3"
                variant="outline"
                onClick={() => setCurrentView('approvals')}
              >
                <CheckCircle2 className="h-4 w-4 text-amber-500" />
                Approuver les demandes
                <span className="ml-auto bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded text-xs">
                  {stats.pendingApprovals}
                </span>
              </Button>
            )}
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

      {/* Bottom Row: Tasks + Social + Resources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    validated: 'bg-teal-500/10 text-teal-600 border-teal-500/20',
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

        {/* Social + WhatsApp + Resources overview */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              Aperçu des connexions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Social accounts */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Réseaux sociaux</p>
              <div className="flex gap-2 flex-wrap">
                {stats?.socialAccountsByPlatform && stats.socialAccountsByPlatform.length > 0 ? (
                  stats.socialAccountsByPlatform.map((item) => (
                    <div key={item.platform} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
                      <Megaphone className="h-3 w-3 text-pink-500" />
                      <span className="text-xs capitalize">{item.platform}</span>
                      <span className="text-xs text-muted-foreground">({item._count.platform})</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Aucun compte connecté</p>
                )}
              </div>
            </div>

            {/* WhatsApp */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <MessageCircle className={`h-4 w-4 ${stats?.whatsappActive ? 'text-green-500' : 'text-muted-foreground'}`} />
                <span className="text-xs">WhatsApp</span>
              </div>
              <div className="flex items-center gap-2">
                {stats?.whatsappAutoMessage && (
                  <span className="text-[10px] text-muted-foreground">Messages</span>
                )}
                {stats?.whatsappAutoCall && (
                  <span className="text-[10px] text-muted-foreground">Appels</span>
                )}
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${stats?.whatsappActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                  {stats?.whatsappActive ? 'Actif' : 'Inactif'}
                </span>
              </div>
            </div>

            {/* Resources */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Ressources</p>
              <div className="flex gap-2 flex-wrap">
                {stats?.resourcesByType && stats.resourcesByType.length > 0 ? (
                  stats.resourcesByType.map((item) => (
                    <div key={item.type} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
                      <Server className="h-3 w-3 text-emerald-500" />
                      <span className="text-xs capitalize">{item.type}</span>
                      <span className="text-xs text-muted-foreground">({item._count.type})</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Aucune ressource configurée</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
