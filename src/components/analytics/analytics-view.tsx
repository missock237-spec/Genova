'use client';

import { useEffect, useState, useMemo } from 'react';
import { BarChart3, TrendingUp, Users, DollarSign, Loader2, Activity, Clock, MessageSquare, Phone, Zap } from 'lucide-react';

interface AnalyticsData {
  totalUsers: number;
  totalAgents: number;
  totalTasks: number;
  totalTokens: number;
  totalCost: number;
  successRate: number;
  totalMessages: number;
  totalVoiceCalls: number;
  avgResponseTime: number;
  dailyActiveUsers: number;
  topAgents: Array<{ name: string; executions: number }>;
  usageByDay: Array<{ date: string; count: number }>;
}

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/analytics?period=${period}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // [js-02] Metrics tableau mémoïsé — recréé uniquement quand data change
  const metrics = useMemo(() => [
    { label: 'Utilisateurs', value: data?.totalUsers ?? 0, icon: Users, color: 'text-blue-500' },
    { label: 'Agents', value: data?.totalAgents ?? 0, icon: Activity, color: 'text-green-500' },
    { label: 'Tâches', value: data?.totalTasks ?? 0, icon: BarChart3, color: 'text-purple-500' },
    { label: 'Messages', value: data?.totalMessages ?? 0, icon: MessageSquare, color: 'text-cyan-500' },
    { label: 'Appels vocaux', value: data?.totalVoiceCalls ?? 0, icon: Phone, color: 'text-orange-500' },
    { label: 'Coût total', value: `$${data?.totalCost?.toFixed(2) ?? '0.00'}`, icon: DollarSign, color: 'text-yellow-500' },
  ], [data]);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Analytiques
          </h1>
          <p className="text-muted-foreground">Statistiques et métriques d&apos;utilisation</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p === '7d' ? '7 jours' : p === '30d' ? '30 jours' : '90 jours'}
            </button>
          ))}
        </div>
      </div>

      {/* Cartes métriques */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="bg-card rounded-xl border border-border p-5 hover:shadow-md hover:border-primary/20 transition-all">
            <div className="flex items-center justify-between mb-3">
              <m.icon className={`h-5 w-5 ${m.color}`} />
            </div>
            <p className="text-2xl font-bold">{String(m.value)}</p>
            <p className="text-sm text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tokens & Taux */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            Tokens & Performance
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Tokens utilisés</p>
              <p className="text-3xl font-bold text-primary">
                {(data?.totalTokens ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Taux de succès</span>
                <span className="font-medium">{data?.successRate?.toFixed(1) ?? '0'}%</span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(data?.successRate ?? 0, 100)}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Temps de réponse moyen</span>
              <span className="font-medium">{data?.avgResponseTime?.toFixed(0) ?? '0'}ms</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Utilisateurs actifs/jour</span>
              <span className="font-medium">{data?.dailyActiveUsers ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Coût */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-yellow-500" />
            Coûts IA
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Coût total</p>
              <p className="text-3xl font-bold text-yellow-500">
                ${data?.totalCost?.toFixed(4) ?? '0.00'}
              </p>
            </div>
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Moyenne par tâche</span>
                <span className="font-medium">
                  {data?.totalTasks && data.totalTasks > 0
                    ? `$${((data.totalCost ?? 0) / data.totalTasks).toFixed(6)}`
                    : '$0.00'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Moyenne par message</span>
                <span className="font-medium">
                  {data?.totalMessages && data.totalMessages > 0
                    ? `$${((data.totalCost ?? 0) / data.totalMessages).toFixed(6)}`
                    : '$0.00'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Agents */}
      {data?.topAgents && data.topAgents.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Agents les plus actifs
          </h2>
          <div className="space-y-2">
            {data.topAgents.slice(0, 5).map((agent, i) => {
              const maxExec = Math.max(...data.topAgents.map(a => a.executions));
              const width = maxExec > 0 ? (agent.executions / maxExec) * 100 : 0;
              return (
                <div key={agent.name} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}</span>
                  <span className="text-sm flex-1 truncate">{agent.name}</span>
                  <div className="flex-1 max-w-xs">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-medium w-16 text-right">{agent.executions}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info si pas de données */}
      {!data && (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Aucune donnée</h3>
          <p className="text-sm text-muted-foreground">Les analytics apparaîtront une fois que vous aurez utilisé la plateforme</p>
        </div>
      )}
    </div>
  );
}
