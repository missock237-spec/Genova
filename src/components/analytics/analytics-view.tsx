'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  DollarSign,
  Bot,
  Activity,
  Clock,
  Zap,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsageData {
  date: string;
  agentCount: number;
  taskCount: number;
  totalTokens: number;
  totalCostUsd: number;
  apiCalls: number;
}

interface CostData {
  provider: string;
  model: string;
  totalTokens: number;
  totalCostUsd: number;
  callCount: number;
}

interface AgentStats {
  id: string;
  name: string;
  type: string;
  totalActions: number;
  totalTokens: number;
  totalCost: number;
  lastActiveAt: string | null;
}

interface MonitoringEvent {
  id: string;
  eventType: string;
  source: string;
  message: string;
  severity: string;
  resolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function AnalyticsStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  trend?: string;
}) {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {trend && <span className="text-emerald-500">{trend}</span>}
          {trend && ' · '}
          {subtitle}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Usage Tab
// ---------------------------------------------------------------------------

function UsageTab() {
  const [data, setData] = useState<UsageData[]>([]);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ daily: UsageData[]; totals: UsageData }>(`/api/analytics/usage?period=${period}`);
      setData(result?.daily || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const totalTokens = data.reduce((s, d) => s + d.totalTokens, 0);
  const totalCost = data.reduce((s, d) => s + d.totalCostUsd, 0);
  const totalCalls = data.reduce((s, d) => s + d.apiCalls, 0);
  const avgDaily = data.length > 0 ? Math.round(totalCalls / data.length) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnalyticsStatCard
          title="Appels API"
          value={totalCalls.toLocaleString()}
          subtitle={`${avgDaily}/jour en moyenne`}
          icon={Zap}
        />
        <AnalyticsStatCard
          title="Tokens utilisés"
          value={totalTokens.toLocaleString()}
          subtitle={`${period === '7d' ? '7' : period === '30d' ? '30' : '90'} derniers jours`}
          icon={BarChart3}
        />
        <AnalyticsStatCard
          title="Coût total"
          value={`${totalCost.toFixed(4)} $`}
          subtitle="USD"
          icon={DollarSign}
        />
        <AnalyticsStatCard
          title="Jours actifs"
          value={data.length.toString()}
          subtitle={`sur ${period === '7d' ? '7' : period === '30d' ? '30' : '90'} jours`}
          icon={Clock}
        />
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {(['7d', '30d', '90d'] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p === '7d' ? '7 jours' : p === '30d' ? '30 jours' : '90 jours'}
          </Button>
        ))}
      </div>

      {/* Usage chart - simple bar representation */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Appels API par jour</CardTitle>
          <CardDescription>Activité quotidienne sur la période</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Aucune donnée pour cette période
            </div>
          ) : (
            <div className="flex items-end gap-1 h-48">
              {data.map((d, i) => {
                const maxCalls = Math.max(...data.map((x) => x.apiCalls), 1);
                const height = Math.max((d.apiCalls / maxCalls) * 100, 2);
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${d.date}: ${d.apiCalls} appels, ${d.totalTokens} tokens, $${d.totalCostUsd.toFixed(4)}`}
                  >
                    <span className="text-[9px] text-muted-foreground">{d.apiCalls}</span>
                    <div
                      className="w-full bg-primary/60 hover:bg-primary rounded-t transition-colors"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Costs Tab
// ---------------------------------------------------------------------------

function CostsTab() {
  const [data, setData] = useState<CostData[]>([]);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [loading, setLoading] = useState(true);

  const fetchCosts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ byModel: CostData[]; byProvider: unknown[] }>(`/api/analytics/costs?period=${period}`);
      setData(result?.byModel || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchCosts(); }, [fetchCosts]);

  const totalCost = data.reduce((s, d) => s + d.totalCostUsd, 0);
  const totalTokens = data.reduce((s, d) => s + d.totalTokens, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnalyticsStatCard
          title="Coût total"
          value={`${totalCost.toFixed(4)} $`}
          subtitle="USD sur la période"
          icon={DollarSign}
        />
        <AnalyticsStatCard
          title="Tokens totaux"
          value={totalTokens.toLocaleString()}
          subtitle="prompt + completion"
          icon={TrendingUp}
        />
        <AnalyticsStatCard
          title="Fournisseurs"
          value={new Set(data.map((d) => d.provider)).size.toString()}
          subtitle="actifs"
          icon={Activity}
        />
      </div>

      <div className="flex gap-2">
        {(['7d', '30d', '90d'] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p === '7d' ? '7 jours' : p === '30d' ? '30 jours' : '90 jours'}
          </Button>
        ))}
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Coûts par modèle</CardTitle>
          <CardDescription>Répartition des coûts IA par fournisseur et modèle</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Aucune donnée de coût
            </div>
          ) : (
            <div className="space-y-3">
              {data.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/30"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={
                        d.provider === 'groq'
                          ? 'border-orange-500/30 text-orange-400'
                          : 'border-blue-500/30 text-blue-400'
                      }
                    >
                      {d.provider}
                    </Badge>
                    <span className="text-sm font-mono">{d.model}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{d.totalCostUsd.toFixed(4)} $</p>
                    <p className="text-xs text-muted-foreground">
                      {d.callCount} appels · {d.totalTokens.toLocaleString()} tokens
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agents Tab
// ---------------------------------------------------------------------------

function AgentsTab() {
  const [data, setData] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiFetch<{ agents: AgentStats[]; summary: unknown }>('/api/analytics/agents');
        setData(result?.agents || []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnalyticsStatCard
          title="Agents actifs"
          value={data.length.toString()}
          subtitle="avec utilisation"
          icon={Bot}
        />
        <AnalyticsStatCard
          title="Actions totales"
          value={data.reduce((s, d) => s + d.totalActions, 0).toLocaleString()}
          subtitle="sur tous les agents"
          icon={Zap}
        />
        <AnalyticsStatCard
          title="Coût agents"
          value={`${data.reduce((s, d) => s + d.totalCost, 0).toFixed(4)} $`}
          subtitle="USD"
          icon={DollarSign}
        />
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Statistiques par agent</CardTitle>
          <CardDescription>Utilisation et coûts détaillés par agent IA</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Aucun agent avec des données d'utilisation
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {data.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{agent.totalActions} actions</p>
                    <p className="text-xs text-muted-foreground">
                      {agent.totalTokens.toLocaleString()} tokens · {agent.totalCost.toFixed(4)} $
                    </p>
                    {agent.lastActiveAt && (
                      <p className="text-[10px] text-muted-foreground">
                        Dernier: {new Date(agent.lastActiveAt).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monitoring Tab
// ---------------------------------------------------------------------------

function MonitoringTab() {
  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ events: MonitoringEvent[]; summary: { total: number; unresolved: number; critical: number } }>('/api/analytics/monitoring?limit=50');
      setEvents(result?.events || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const resolveEvent = async (eventId: string) => {
    try {
      await apiFetch('/api/analytics/monitoring', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, resolved: true }),
      });
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, resolved: true, resolvedAt: new Date().toISOString() } : e))
      );
    } catch {
      // silent
    }
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'medium': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <CheckCircle2 className="h-4 w-4 text-blue-400" />;
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-red-500/30 bg-red-500/5';
      case 'high': return 'border-orange-500/30 bg-orange-500/5';
      case 'medium': return 'border-yellow-500/30 bg-yellow-500/5';
      default: return 'border-blue-500/30 bg-blue-500/5';
    }
  };

  const unresolvedCount = events.filter((e) => !e.resolved).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnalyticsStatCard
          title="Événements"
          value={events.length.toString()}
          subtitle="total"
          icon={Activity}
        />
        <AnalyticsStatCard
          title="Non résolus"
          value={unresolvedCount.toString()}
          subtitle={unresolvedCount > 0 ? 'Nécessitent attention' : 'Tout est OK'}
          icon={AlertTriangle}
          trend={unresolvedCount === 0 ? 'Aucun' : undefined}
        />
        <AnalyticsStatCard
          title="Critiques"
          value={events.filter((e) => e.severity === 'critical' && !e.resolved).length.toString()}
          subtitle="non résolus"
          icon={XCircle}
        />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Événements récents</h3>
        <Button variant="ghost" size="sm" onClick={fetchEvents}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Rafraîchir
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          Aucun événement de monitoring
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {events.map((event) => (
            <div
              key={event.id}
              className={`flex items-start justify-between p-3 rounded-lg border ${severityColor(event.severity)} ${
                event.resolved ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {severityIcon(event.severity)}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{event.message}</span>
                    <Badge variant="outline" className="text-[10px] h-4">
                      {event.source}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(event.createdAt).toLocaleString('fr-FR')}
                  </p>
                </div>
              </div>
              {!event.resolved && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6"
                  onClick={() => resolveEvent(event.id)}
                >
                  Résoudre
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Analytics View
// ---------------------------------------------------------------------------

export function AnalyticsView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Utilisation des agents, coûts IA, historique et monitoring
        </p>
      </div>

      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usage" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Utilisation
          </TabsTrigger>
          <TabsTrigger value="costs" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />
            Coûts IA
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Monitoring
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usage">
          <UsageTab />
        </TabsContent>
        <TabsContent value="costs">
          <CostsTab />
        </TabsContent>
        <TabsContent value="agents">
          <AgentsTab />
        </TabsContent>
        <TabsContent value="monitoring">
          <MonitoringTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
