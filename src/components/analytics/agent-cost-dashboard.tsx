'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  DollarSign,
  Coins,
  Cpu,
  TrendingUp,
  Bot,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  BarChart3,
  Calendar,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AgentBudget } from '@/lib/agent-costs';

interface AgentCostDashboardProps {
  userId: string;
}

interface CostBreakdownData {
  byAgent: Record<string, { totalCost: number; totalTokens: number; count: number }>;
  byDay: Record<string, { totalCost: number; totalTokens: number; count: number }>;
  byModel: Record<string, { totalCost: number; totalTokens: number; count: number }>;
  records: Array<{
    id?: string;
    agentId: string;
    conversationId: string;
    userId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costInCredits: number;
    timestamp: string;
  }>;
  totalSpend: number;
  totalTokens: number;
}

export function AgentCostDashboard({ userId }: AgentCostDashboardProps) {
  const [data, setData] = useState<CostBreakdownData | null>(null);
  const [budgets, setBudgets] = useState<Record<string, AgentBudget>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const fetchCostData = useCallback(async () => {
    try {
      setError(null);
      let startDateStr: string | undefined;
      const now = new Date();

      if (period === '7d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        startDateStr = d.toISOString();
      } else if (period === '30d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        startDateStr = d.toISOString();
      } else if (period === '90d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 90);
        startDateStr = d.toISOString();
      }

      const params = new URLSearchParams({ userId });
      if (startDateStr) {
        params.append('startDate', startDateStr);
      }

      const res = await fetch(`/api/agent-costs?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load cost analytics');
      }

      setData(json);

      // [client-01] Batch budget fetch — un seul appel au lieu de N appels.
      // On passe tous les agentIds en query param pour éviter le pattern N+1.
      const agentIds = Object.keys(json.byAgent || {});
      if (agentIds.length > 0) {
        try {
          const bRes = await fetch(
            `/api/agent-costs/budgets?userId=${encodeURIComponent(userId)}&agentIds=${agentIds.map(encodeURIComponent).join(',')}`
          );
          const bJson = await bRes.json();
          if (bRes.ok && bJson.success && bJson.budgets) {
            setBudgets(bJson.budgets);
          } else {
            setBudgets({});
          }
        } catch {
          setBudgets({});
        }
      } else {
        setBudgets({});
      }
    } catch (err: any) {
      setError(err?.message || 'Error fetching cost data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, period]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        setLoading(true);
        try { await fetchCostData(); } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [fetchCostData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCostData();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center space-x-2 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin text-primary" />
        <span>Loading cost analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 text-destructive">
        <CardContent className="flex items-center space-x-3 p-6">
          <AlertTriangle className="h-6 w-6 flex-shrink-0" />
          <div>
            <p className="font-semibold">Unable to load analytics</p>
            <p className="text-sm opacity-90">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-auto">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // [rendering-4] Tri + Math.max mémoïsés — évite de recalculer à chaque hover/click
  const { agentEntries, dayEntries, modelEntries, maxAgentCost, maxDayCost } = useMemo(() => {
    const aEntries = Object.entries(data?.byAgent || {}).sort(
      ([, a], [, b]) => b.totalCost - a.totalCost
    );
    const dEntries = Object.entries(data?.byDay || {}).sort(
      ([a], [b]) => a.localeCompare(b)
    );
    const mEntries = Object.entries(data?.byModel || {}).sort(
      ([, a], [, b]) => b.totalCost - a.totalCost
    );
    return {
      agentEntries: aEntries,
      dayEntries: dEntries,
      modelEntries: mEntries,
      maxAgentCost: Math.max(...aEntries.map(([, v]) => v.totalCost), 1),
      maxDayCost: Math.max(...dEntries.map(([, v]) => v.totalCost), 1),
    };
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary" />
            Agent Cost Analytics & Budget Guards
          </h2>
          <p className="text-sm text-muted-foreground">
            Track token usage, credit consumption, and budget thresholds per agent.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center rounded-lg border border-border bg-card p-1 text-xs">
            {(['7d', '30d', '90d', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  period === p
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card text-card-foreground shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Credit Spend
            </CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(data?.totalSpend || 0).toFixed(2)}{' '}
              <span className="text-xs font-normal text-muted-foreground">credits</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              Across {agentEntries.length} agent(s)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card text-card-foreground shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Tokens Used
            </CardTitle>
            <Cpu className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(data?.totalTokens || 0).toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
              <Layers className="h-3 w-3 text-primary" />
              Input & Output combined
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card text-card-foreground shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Agents
            </CardTitle>
            <Bot className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agentEntries.length}</div>
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              With recorded cost entries
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card text-card-foreground shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Executions
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(data?.records || []).length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              Recorded transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown by Agent */}
      <Card className="bg-card text-card-foreground shadow-xs">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Cost Breakdown by Agent
          </CardTitle>
          <CardDescription>
            Credit consumption and token usage per individual agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {agentEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No cost records found for the selected period.
            </p>
          ) : (
            agentEntries.map(([agentId, stats]) => {
              const percentage = Math.round((stats.totalCost / maxAgentCost) * 100);
              const budget = budgets[agentId];

              return (
                <div key={agentId} className="space-y-1.5 rounded-lg border border-border p-3.5 bg-muted/20">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-foreground">{agentId}</span>
                      {budget && budget.isEnabled && (
                        <Badge variant="outline" className="text-xs bg-card border-border">
                          Guard Active
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-foreground">
                        {stats.totalCost.toFixed(2)} credits
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({stats.totalTokens.toLocaleString()} tokens, {stats.count} calls)
                      </span>
                    </div>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Daily Spend Trends */}
      <Card className="bg-card text-card-foreground shadow-xs">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Daily Spend Trends
          </CardTitle>
          <CardDescription>
            Daily credit expenditure pattern over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dayEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No daily spend data available.
            </p>
          ) : (
            <div className="space-y-3">
              {dayEntries.slice(-14).map(([day, stats]) => {
                const percentage = Math.round((stats.totalCost / maxDayCost) * 100);
                return (
                  <div key={day} className="flex items-center space-x-3 text-sm">
                    <div className="w-24 text-xs font-mono text-muted-foreground flex-shrink-0">
                      {day}
                    </div>
                    <div className="flex-1">
                      <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-primary/80 transition-all duration-300 rounded-full"
                          style={{ width: `${Math.max(percentage, 2)}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-28 text-right font-medium text-xs text-foreground">
                      {stats.totalCost.toFixed(2)} cr ({stats.count} calls)
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Budget Status & Guards Section */}
      <Card className="bg-card text-card-foreground shadow-xs border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Active Budget Guards & Threshold Status
          </CardTitle>
          <CardDescription>
            Real-time daily and monthly credit limit progress per agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.keys(budgets).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No active budget guards configured yet. Use the Cost Alert Settings component to configure daily and monthly limits for your agents.
            </div>
          ) : (
            Object.values(budgets).map((budget) => {
              const dailyPct = budget.dailyLimit > 0
                ? Math.min(100, Math.round((budget.currentDailySpend / budget.dailyLimit) * 100))
                : 0;

              const monthlyPct = budget.monthlyLimit > 0
                ? Math.min(100, Math.round((budget.currentMonthlySpend / budget.monthlyLimit) * 100))
                : 0;

              const maxPct = Math.max(dailyPct, monthlyPct);

              // Progress bar color logic using standard Tailwind status colors
              let progressColorClass = 'bg-emerald-500';
              let badgeBgClass = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
              let statusText = 'Normal';

              if (maxPct >= 100) {
                progressColorClass = 'bg-destructive';
                badgeBgClass = 'bg-destructive/10 text-destructive border-destructive/20';
                statusText = 'Limit Exceeded';
              } else if (maxPct >= (budget.alertThreshold || 0.8) * 100) {
                progressColorClass = 'bg-amber-500';
                badgeBgClass = 'bg-amber-500/10 text-amber-500 border-amber-500/20';
                statusText = 'Alert Warning';
              }

              return (
                <div
                  key={budget.agentId}
                  className="rounded-lg border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-foreground text-sm">
                        Agent: {budget.agentId}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        Alert threshold at {Math.round((budget.alertThreshold || 0.8) * 100)}%
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Badge className={badgeBgClass}>
                        {statusText}
                      </Badge>
                      <Badge variant={budget.isEnabled ? 'default' : 'secondary'} className="text-xs">
                        {budget.isEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>

                  {/* Daily Budget Progress */}
                  {budget.dailyLimit > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Daily Spend: {budget.currentDailySpend.toFixed(2)} / {budget.dailyLimit} credits</span>
                        <span className="font-medium text-foreground">{dailyPct}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            dailyPct >= 100
                              ? 'bg-destructive'
                              : dailyPct >= (budget.alertThreshold || 0.8) * 100
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${dailyPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Monthly Budget Progress */}
                  {budget.monthlyLimit > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Monthly Spend: {budget.currentMonthlySpend.toFixed(2)} / {budget.monthlyLimit} credits</span>
                        <span className="font-medium text-foreground">{monthlyPct}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            monthlyPct >= 100
                              ? 'bg-destructive'
                              : monthlyPct >= (budget.alertThreshold || 0.8) * 100
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${monthlyPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Model Breakdown */}
      <Card className="bg-card text-card-foreground shadow-xs">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Spend & Usage by AI Model
          </CardTitle>
          <CardDescription>
            Distribution across language models
          </CardDescription>
        </CardHeader>
        <CardContent>
          {modelEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No model usage records found.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {modelEntries.map(([model, stats]) => (
                <div
                  key={model}
                  className="rounded-lg border border-border bg-muted/10 p-3.5 space-y-1"
                >
                  <div className="text-xs font-mono font-semibold text-primary">
                    {model}
                  </div>
                  <div className="text-lg font-bold text-foreground">
                    {stats.totalCost.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">credits</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {stats.totalTokens.toLocaleString()} tokens ({stats.count} calls)
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
