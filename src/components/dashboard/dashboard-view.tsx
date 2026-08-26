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

// Recharts tooltip style
const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#0E0F11',
    border: '1px solid #1C1E22',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#E6E8EC',
  },
  labelStyle: { color: '#8A9099' },
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

  // Build chart data from recentActivity
  const chartData = useMemo(() => {
    if (!stats?.recentActivity?.length) return [];
    // Group activity by date
    const grouped: Record<string, number> = {};
    const now = new Date();
    // Create last 7 days buckets
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

  const statCards = [
    { label: 'Agents', value: stats?.agentCount ?? 0, icon: Bot, color: '#00F5FF', bg: 'rgba(0,245,255,0.1)' },
    { label: 'Sessions actives', value: stats?.activeSessions ?? 0, icon: Activity, color: '#7CFFB2', bg: 'rgba(124,255,178,0.1)' },
    { label: 'Tâches totales', value: stats?.totalTasks ?? 0, icon: Zap, color: '#FFB800', bg: 'rgba(255,184,0,0.1)' },
    { label: 'Taux de succès', value: `${stats?.successRate ?? 0}%`, icon: TrendingUp, color: '#4D9FFF', bg: 'rgba(77,159,255,0.1)' },
    { label: 'Crédits utilisés', value: stats?.creditsUsed ?? 0, icon: Wallet, color: '#FF5C5C', bg: 'rgba(255,92,92,0.1)' },
    { label: 'Crédits restants', value: stats?.creditsRemaining ?? 0, icon: CheckCircle, color: '#7CFFB2', bg: 'rgba(124,255,178,0.1)' },
  ];

  const quickActions: { label: string; icon: React.ElementType; view: ModernViewType; color: string }[] = [
    { label: 'New Agent', icon: Bot, view: 'agents', color: '#00F5FF' },
    { label: 'New Workflow', icon: GitBranch, view: 'coordination', color: '#FFB800' },
    { label: 'Voice Studio', icon: Mic, view: 'voice', color: '#4D9FFF' },
    { label: 'Generate Image', icon: ImageIcon, view: 'images', color: '#7CFFB2' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-[#8A9099] text-sm mt-0.5">
            Bienvenue, {user?.name || 'Utilisateur'}
          </p>
        </div>
        <motion.button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1C1E22] bg-[#0E0F11] hover:border-[rgba(0,245,255,0.2)] hover:bg-[rgba(0,245,255,0.04)] text-sm text-[#8A9099] hover:text-[#00F5FF] transition-all disabled:opacity-50"
        >
          <Loader2 className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </motion.button>
      </div>

      {/* Stat cards with stagger animation */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 stat-card rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {statCards.map((card) => (
            <motion.div
              key={card.label}
              variants={itemVariants}
              whileHover={{ y: -2 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="stat-card rounded-xl p-4 sm:p-5 cursor-default"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                style={{ background: card.bg }}
              >
                <card.icon className="h-4.5 w-4.5" style={{ color: card.color }} />
              </div>
              <p className="text-2xl font-bold tracking-tight">{card.value}</p>
              <p className="text-xs text-[#8A9099] mt-1">{card.label}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, type: 'spring', stiffness: 300, damping: 24 }}
      >
        <h2 className="text-sm font-semibold text-[#8A9099] uppercase tracking-[0.1em] mb-3">Actions rapides</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <motion.button
              key={action.label}
              onClick={() => setCurrentView(action.view as any)}
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="stat-card rounded-xl p-4 flex items-center gap-3 text-left group transition-all"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${action.color}15` }}
              >
                <action.icon className="h-4 w-4" style={{ color: action.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#E6E8EC] truncate">{action.label}</p>
                <Plus className="h-3 w-3 text-[#8A9099] mt-1 group-hover:text-[#00F5FF] transition-colors" />
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Usage Chart */}
        <motion.div
          className="lg:col-span-2 stat-card rounded-xl p-5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 24 }}
        >
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#00F5FF]" />
            Activité récente (7 jours)
          </h2>
          {chartData.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00F5FF" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#00F5FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C1E22" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#8A9099' }}
                    axisLine={{ stroke: '#1C1E22' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8A9099' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#00F5FF"
                    strokeWidth={2}
                    fill="url(#activityGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-52 text-[#8A9099] text-sm">
              Aucune donnée disponible
            </div>
          )}
        </motion.div>

        {/* System Info */}
        <motion.div
          className="stat-card rounded-xl p-5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 24 }}
        >
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[#FFB800]" />
            Système
          </h2>
          <div className="space-y-4">
            {[
              { label: 'Version', value: '1.0.0' },
              { label: 'Plan', value: user?.plan || 'free', capitalize: true },
              { label: 'Rôle', value: (user as { role?: string })?.role || 'user', capitalize: true },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-sm text-[#8A9099]">{item.label}</span>
                <span className={`text-sm font-medium font-mono ${item.capitalize ? 'capitalize' : ''}`}>
                  {item.value}
                </span>
              </div>
            ))}
            <div className="pt-3 border-t border-[#1C1E22]">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#8A9099]">Statut</span>
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="w-2 h-2 rounded-full bg-[#7CFFB2] animate-pulse" />
                  <span className="text-[#7CFFB2] font-medium">En ligne</span>
                </span>
              </div>
            </div>
            <div className="pt-3 border-t border-[#1C1E22]">
              <span className="text-xs text-[#8A9099] font-mono break-all">{user?.email}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent Activity Feed */}
      <motion.div
        className="stat-card rounded-xl p-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, type: 'spring', stiffness: 300, damping: 24 }}
      >
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#FFB800]" />
          Feed d'activité
        </h2>
        {stats?.recentActivity && stats.recentActivity.length > 0 ? (
          <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
            {stats.recentActivity.slice(0, 10).map((act, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.04 }}
                className="flex items-center gap-3 text-sm p-2.5 rounded-lg hover:bg-[rgba(0,245,255,0.04)] transition-colors"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#00F5FF] shrink-0" style={{ boxShadow: '0 0 6px rgba(0,245,255,0.4)' }} />
                <span className="flex-1 text-[#E6E8EC]">{act.action}</span>
                <span className="text-[#8A9099] text-xs whitespace-nowrap font-mono">
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
          <div className="flex flex-col items-center justify-center py-8 text-[#8A9099]">
            <Activity className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Aucune activité récente</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
