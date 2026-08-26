'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuthStore, useAppStore, useModernStore } from '@/lib/store';
import { motion } from 'framer-motion';
import {
  Bot, Activity, Zap, TrendingUp, Wallet, CheckCircle,
  Clock, AlertCircle, Loader2, Plus, GitBranch, Mic, ImageIcon,
} from 'lucide-react';
import type { ModernViewType } from '@/lib/store';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface DashboardStats {
  agentCount: number;
  activeSessions: number;
  totalTasks: number;
  successRate: number;
  creditsUsed: number;
  creditsRemaining: number;
  recentActivity: { action: string; createdAt: string }[];
}

// Animation variants for stagger
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
} as const;

// Recharts tooltip style — éditorial sobre
const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--hairline-strong)',
    borderRadius: '2px',
    fontSize: '12px',
    color: 'var(--foreground)',
  },
  labelStyle: { color: 'var(--muted-foreground)' },
};

export function DashboardView() {
  const { user } = useAuthStore();
  const { setCurrentView } = useAppStore();
  const { setDashboardStats } = useModernStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setDashboardStats(data);
      } else {
        setStats({
          agentCount: 0,
          activeSessions: 0,
          totalTasks: 0,
          successRate: 0,
          creditsUsed: 0,
          creditsRemaining: 0,
          recentActivity: [],
        });
      }
    } catch {
      setStats({
        agentCount: 0,
        activeSessions: 0,
        totalTasks: 0,
        successRate: 0,
        creditsUsed: 0,
        creditsRemaining: 0,
        recentActivity: [],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) try { await fetchStats(); } catch {}
    })();
    const interval = setInterval(() => { void fetchStats(true); }, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Données du graphique 7 jours
  const chartData = useMemo(() => {
    if (!stats?.recentActivity?.length) return [];
    const grouped: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      grouped[key] = 0;
    }
    stats.recentActivity.forEach((act) => {
      const key = new Date(act.createdAt).toISOString().split('T')[0];
      if (key in grouped) {
        grouped[key]++;
      }
    });
    return Object.entries(grouped).map(([date, count]) => ({
      date: new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      count,
    }));
  }, [stats?.recentActivity]);

  // Cartes de stats — palette éditoriale (vermillon/ultramarine/ochre/moss)
  const statCards = [
    { label: 'Agents', value: stats?.agentCount ?? 0, icon: Bot, tone: 'vermillon' as const },
    { label: 'Sessions actives', value: stats?.activeSessions ?? 0, icon: Activity, tone: 'moss' as const },
    { label: 'Tâches totales', value: stats?.totalTasks ?? 0, icon: Zap, tone: 'ochre' as const },
    { label: 'Taux de succès', value: `${stats?.successRate ?? 0}%`, icon: TrendingUp, tone: 'ultramarine' as const },
    { label: 'Crédits utilisés', value: stats?.creditsUsed ?? 0, icon: Wallet, tone: 'vermillon' as const },
    { label: 'Crédits restants', value: stats?.creditsRemaining ?? 0, icon: CheckCircle, tone: 'moss' as const },
  ];

  const toneColor = (tone: string) => {
    switch (tone) {
      case 'vermillon': return 'var(--color-vermillion)';
      case 'ultramarine': return 'var(--color-ultramarine)';
      case 'ochre': return 'var(--color-ochre)';
      case 'moss': return 'var(--color-moss)';
      default: return 'var(--color-vermillion)';
    }
  };

  const quickActions: { label: string; icon: React.ElementType; view: ModernViewType; tone: string }[] = [
    { label: 'New Agent', icon: Bot, view: 'agents', tone: 'vermillon' },
    { label: 'New Workflow', icon: GitBranch, view: 'coordination', tone: 'ochre' },
    { label: 'Voice Studio', icon: Mic, view: 'voice', tone: 'ultramarine' },
    { label: 'Generate Image', icon: ImageIcon, view: 'images', tone: 'moss' },
  ];

  return (
    <div className="space-y-8">
      {/* Header — éditorial : titre serif + sous-titre mono */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="editorial-eyebrow">01 · Tableau de bord</span>
          <h1 className="editorial-headline text-3xl mt-2">
            Bienvenue, <em className="text-[var(--color-vermillion)] not-italic font-medium">{user?.name || 'Utilisateur'}</em>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Vue d&apos;ensemble du système d&apos;agents
          </p>
        </div>
        <motion.button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          className="btn-ghost rounded-sm px-4 py-2 text-sm font-[family-name:var(--font-geist-mono)] uppercase tracking-wider text-[0.72rem] disabled:opacity-50 flex items-center gap-2"
        >
          <Loader2 className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </motion.button>
      </div>

      {/* Stat cards — bento hairline */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-px bg-[var(--hairline-strong)] border border-[var(--hairline-strong)]">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 bg-[var(--card)] animate-pulse" />
          ))}
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-px bg-[var(--hairline-strong)] border border-[var(--hairline-strong)]"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {statCards.map((card, idx) => (
            <motion.div
              key={card.label}
              variants={itemVariants}
              whileHover={{ y: -1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="instrument-card-flat p-4 sm:p-5 cursor-default rounded-none border-0"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="editorial-section-num">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <card.icon className="h-4 w-4" style={{ color: toneColor(card.tone) }} />
              </div>
              <p className="font-[family-name:var(--font-newsreader)] text-3xl font-medium tracking-tight">
                {card.value}
              </p>
              <p className="hardtech-data text-[0.66rem] text-muted-foreground mt-1 uppercase tracking-wider">{card.label}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Actions rapides */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, type: 'spring', stiffness: 300, damping: 24 }}
      >
        <div className="flex items-baseline justify-between mb-3">
          <span className="editorial-eyebrow">02 · Actions rapides</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--hairline-strong)] border border-[var(--hairline-strong)]">
          {quickActions.map((action) => (
            <motion.button
              key={action.label}
              onClick={() => setCurrentView(action.view as any)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="instrument-card-flat p-4 flex items-center gap-3 text-left group transition-colors rounded-none border-0 hover:bg-[var(--secondary)]"
            >
              <action.icon className="h-4 w-4 shrink-0" style={{ color: toneColor(action.tone) }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{action.label}</p>
              </div>
              <Plus className="h-3 w-3 text-muted-foreground group-hover:text-[var(--color-vermillion)] transition-colors shrink-0" />
            </motion.button>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[var(--hairline-strong)] border border-[var(--hairline-strong)]">
        {/* Graphique d'activité */}
        <motion.div
          className="lg:col-span-2 bg-[var(--card)] p-5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 24 }}
        >
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-[var(--color-vermillion)]" />
              Activité récente — 7 jours
            </h2>
            <span className="editorial-meta">FIG. 01</span>
          </div>
          {chartData.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-vermillion)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--color-vermillion)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--hairline)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-geist-mono)' }}
                    axisLine={{ stroke: 'var(--hairline-strong)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-geist-mono)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="var(--color-vermillion)"
                    strokeWidth={1.5}
                    fill="url(#activityGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-52 text-muted-foreground text-sm">
              <em className="font-[family-name:var(--font-newsreader)] italic">Aucune donnée disponible</em>
            </div>
          )}
        </motion.div>

        {/* Système */}
        <motion.div
          className="bg-[var(--card)] p-5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 24 }}
        >
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4 text-[var(--color-ochre)]" />
              Système
            </h2>
            <span className="editorial-meta">FIG. 02</span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Version', value: 'REV.2.4' },
              { label: 'Plan', value: user?.plan || 'free', capitalize: true },
              { label: 'Rôle', value: (user as { role?: string })?.role || 'user', capitalize: true },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-baseline border-b border-[var(--hairline)] pb-2">
                <span className="hardtech-data text-[0.66rem] text-muted-foreground uppercase tracking-wider">{item.label}</span>
                <span className={`text-sm font-medium font-[family-name:var(--font-geist-mono)] ${item.capitalize ? 'capitalize' : ''}`}>
                  {item.value}
                </span>
              </div>
            ))}
            <div className="pt-2">
              <div className="flex justify-between items-center">
                <span className="hardtech-data text-[0.66rem] text-muted-foreground uppercase tracking-wider">Statut</span>
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="status-mark" />
                  <span className="text-[var(--color-moss)] font-medium font-[family-name:var(--font-geist-mono)] uppercase tracking-wider text-[0.7rem]">En ligne</span>
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-[var(--hairline)]">
              <span className="hardtech-data text-[0.62rem] text-muted-foreground break-all">{user?.email}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Feed d'activité */}
      <motion.div
        className="bg-[var(--card)] border border-[var(--hairline-strong)] p-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, type: 'spring', stiffness: 300, damping: 24 }}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-[var(--color-ochre)]" />
            Feed d&apos;activité
          </h2>
          <span className="editorial-meta">FIG. 03</span>
        </div>
        {stats?.recentActivity && stats.recentActivity.length > 0 ? (
          <div className="space-y-px max-h-64 overflow-y-auto custom-scrollbar">
            {stats.recentActivity.slice(0, 10).map((act, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.04 }}
                className="flex items-center gap-3 text-sm p-2.5 hover:bg-[var(--secondary)] transition-colors"
              >
                <span className="status-mark shrink-0" />
                <span className="flex-1">{act.action}</span>
                <span className="hardtech-data text-[0.62rem] text-muted-foreground whitespace-nowrap">
                  {new Date(act.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm font-[family-name:var(--font-newsreader)] italic">Aucune activité récente</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
