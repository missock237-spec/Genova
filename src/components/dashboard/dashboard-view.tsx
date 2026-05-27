'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore, useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/shared/stat-card';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { Bot, Play, Workflow, ShieldCheck, Plus, Wand2, GitBranch, Activity, Zap, Brain, Cpu, ArrowRight, Database, HardDrive, Clock, RotateCcw, Eye, Lightbulb, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

/* ===== System Architecture Flow Diagram ===== */
const ARCHITECTURE_NODES = [
  { id: 'think', label: 'Think', icon: Lightbulb, color: 'text-violet-500', bgColor: 'bg-violet-500/10', borderColor: 'border-violet-500/30' },
  { id: 'act', label: 'Act', icon: Zap, color: 'text-sky-500', bgColor: 'bg-sky-500/10', borderColor: 'border-sky-500/30' },
  { id: 'observe', label: 'Observe', icon: Eye, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30' },
  { id: 'reflect', label: 'Reflect', icon: RefreshCw, color: 'text-purple-500', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30' },
  { id: 'retry', label: 'Retry', icon: RotateCcw, color: 'text-amber-500', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30' },
];

function ArchitectureFlowDiagram() {
  const [activeNode, setActiveNode] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveNode(prev => (prev + 1) % ARCHITECTURE_NODES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 overflow-x-auto py-2">
      {ARCHITECTURE_NODES.map((node, i) => {
        const Icon = node.icon;
        const isActive = activeNode === i;
        return (
          <div key={node.id} className="flex items-center">
            <motion.div
              animate={{
                scale: isActive ? 1.08 : 1,
                y: isActive ? -3 : 0,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className={`
                flex flex-col items-center gap-1.5 p-2 sm:p-3 rounded-xl border transition-all duration-300
                ${isActive
                  ? `${node.bgColor} ${node.borderColor} state-node-active node-pulse`
                  : 'border-border/50 bg-card/50'
                }
              `}
            >
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full ${node.bgColor} flex items-center justify-center`}>
                <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${node.color} ${isActive ? 'state-node-icon' : ''}`} />
              </div>
              <span className={`text-[10px] sm:text-xs font-medium ${isActive ? node.color : 'text-muted-foreground'}`}>
                {node.label}
              </span>
            </motion.div>
            {i < ARCHITECTURE_NODES.length - 1 && (
              <div className="flex items-center mx-0.5 sm:mx-1">
                <motion.div
                  animate={{
                    opacity: activeNode === i ? 1 : 0.3,
                    scaleX: activeNode === i ? 1 : 0.8,
                  }}
                  transition={{ duration: 0.3 }}
                  className="w-4 sm:w-8 h-0.5 relative overflow-hidden"
                >
                  <div className={`absolute inset-0 ${activeNode === i ? 'bg-emerald-500/60' : 'bg-border'}`} />
                  {activeNode === i && (
                    <motion.div
                      className="absolute inset-y-0 left-0 w-3 bg-emerald-400/80 rounded-full"
                      animate={{ x: [0, 32] }}
                      transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
                    />
                  )}
                </motion.div>
                <ArrowRight className={`h-3 w-3 ${activeNode === i ? 'text-emerald-500' : 'text-muted-foreground/30'}`} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ===== Memory Stats Card ===== */
interface MemoryStats {
  shortTerm: number;
  shortTermMax: number;
  longTerm: number;
  longTermMax: number;
  episodic: number;
  episodicMax: number;
}

function MemoryStatsCard() {
  const [memory, setMemory] = useState<MemoryStats>({
    shortTerm: 67,
    shortTermMax: 128,
    longTerm: 2340,
    longTermMax: 5000,
    episodic: 89,
    episodicMax: 200,
  });

  // Simulate live memory updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMemory(prev => ({
        shortTerm: Math.min(prev.shortTermMax, Math.max(0, prev.shortTerm + Math.floor(Math.random() * 7) - 3)),
        shortTermMax: prev.shortTermMax,
        longTerm: Math.min(prev.longTermMax, Math.max(0, prev.longTerm + Math.floor(Math.random() * 15) - 5)),
        longTermMax: prev.longTermMax,
        episodic: Math.min(prev.episodicMax, Math.max(0, prev.episodic + Math.floor(Math.random() * 5) - 2)),
        episodicMax: prev.episodicMax,
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const memories = [
    { label: 'Mémoire court terme', icon: Clock, value: memory.shortTerm, max: memory.shortTermMax, color: 'bg-sky-500', indicatorColor: 'bg-sky-500' },
    { label: 'Mémoire long terme', icon: Database, value: memory.longTerm, max: memory.longTermMax, color: 'bg-emerald-500', indicatorColor: 'bg-emerald-500' },
    { label: 'Mémoire épisodique', icon: HardDrive, value: memory.episodic, max: memory.episodicMax, color: 'bg-purple-500', indicatorColor: 'bg-purple-500' },
  ];

  return (
    <Card className="border-border/50 glass-card-emerald">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          Mémoire système
          <Badge variant="outline" className="text-[9px] h-4 ml-auto bg-emerald-500/10 text-emerald-600 border-emerald-500/20 badge-pulse">
            Live
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {memories.map((mem) => {
          const Icon = mem.icon;
          const percentage = Math.round((mem.value / mem.max) * 100);
          return (
            <div key={mem.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">{mem.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {mem.value.toLocaleString()} / {mem.max.toLocaleString()}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${mem.color} progress-bar-shine`}
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ===== Real-time Activity Pulse ===== */
interface LiveActivity {
  id: string;
  action: string;
  category: string;
  timestamp: Date;
  isNew?: boolean;
}

function RealtimeActivityPulse({ baseActivities }: { baseActivities: DashboardStats['recentActivities'] }) {
  const initialActivities: LiveActivity[] = baseActivities.slice(0, 5).map(a => ({
    id: a.id,
    action: a.action,
    category: a.category,
    timestamp: new Date(a.createdAt),
    isNew: false,
  }));
  const [liveActivities, setLiveActivities] = useState<LiveActivity[]>(initialActivities);

  // Simulate live activity pulses
  const simulatedActions = useCallback(() => {
    const actions = [
      { action: 'Agent analytique — vérification des garde-fous', category: 'agent' },
      { action: 'Workflow marketing — étape 3 complétée', category: 'workflow' },
      { action: 'Mémoire épisodique — nouveau souvenir stocké', category: 'system' },
      { action: 'Agent de vente — prospection en cours', category: 'agent' },
      { action: 'Routeur IA — basculement vers Groq', category: 'system' },
      { action: 'Validation — résultat vérifié avec succès', category: 'guardrail' },
      { action: 'Agent support — réponse envoyée', category: 'agent' },
      { action: 'Workflow analyse — démarrage de l\'étape 2', category: 'workflow' },
    ];
    return actions[Math.floor(Math.random() * actions.length)];
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const sim = simulatedActions();
      const newActivity: LiveActivity = {
        id: `live_${Date.now()}`,
        action: sim.action,
        category: sim.category,
        timestamp: new Date(),
        isNew: true,
      };
      setLiveActivities(prev => [newActivity, ...prev.slice(0, 7)]);
      const activityId = newActivity.id;
      // Remove "new" flag after animation
      setTimeout(() => {
        setLiveActivities(prev =>
          prev.map(a => a.id === activityId ? { ...a, isNew: false } : a)
        );
      }, 1000);
    }, 5000);
    return () => clearInterval(interval);
  }, [simulatedActions]);

  const categoryColors: Record<string, string> = {
    agent: 'bg-emerald-500/10 text-emerald-600',
    workflow: 'bg-sky-500/10 text-sky-600',
    system: 'bg-purple-500/10 text-purple-600',
    guardrail: 'bg-amber-500/10 text-amber-600',
  };

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
      <AnimatePresence initial={false}>
        {liveActivities.map((activity) => (
          <motion.div
            key={activity.id}
            initial={activity.isNew ? { opacity: 0, x: -20, height: 0 } : false}
            animate={{ opacity: 1, x: 0, height: 'auto' }}
            exit={{ opacity: 0, x: 20, height: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
              activity.isNew ? 'bg-emerald-500/5 border border-emerald-500/10' : 'hover:bg-muted/50'
            }`}
          >
            <div className="relative">
              <div className={`w-2 h-2 rounded-full ${activity.isNew ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
              {activity.isNew && (
                <motion.div
                  className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500"
                  animate={{ scale: [1, 2, 1], opacity: [1, 0, 1] }}
                  transition={{ duration: 1, repeat: 1 }}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{activity.action}</p>
            </div>
            <Badge variant="outline" className={`text-[9px] h-4 ${categoryColors[activity.category] || ''}`}>
              {activity.category}
            </Badge>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {activity.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ===== Main Dashboard View ===== */
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
      // Credentials included automatically for same-origin — httpOnly cookie sent
      const res = await fetch('/api/dashboard/stats', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else if (res.status === 401) {
        // Session expired — redirect to login
        console.warn('Session expired');
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
          description={stats?.activeAgents ? 'En fonctionnement' : 'Aucun agent actif'}
          trend={stats?.activeAgents ? `${Math.round(((stats.activeAgents) / Math.max(stats.totalAgents, 1)) * 100)}% du total` : undefined}
        />
        <StatCard
          title="Tâches en cours"
          value={stats?.runningTasks || 0}
          icon={Play}
          description={stats?.runningTasks ? 'En exécution' : 'Aucune tâche en cours'}
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
          description={stats?.activeWorkflows ? 'En cours d’exécution' : 'Aucun workflow actif'}
        />
      </div>

      {/* System Architecture Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card className="border-border/50 glass-card-emerald overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              Architecture du moteur d'agents
              <Badge variant="outline" className="text-[9px] h-4 ml-auto bg-emerald-500/10 text-emerald-600 border-emerald-500/20 badge-pulse">
                Live
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ArchitectureFlowDiagram />
            <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-primary">Cycle ReAct+ étendu :</span> L'agent passe par les phases Think → Act → Observe → Reflect → Retry. La réflexion et la correction automatique permettent une exécution plus robuste et autonome.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* AI Router Status */}
      <Card className="border-border/50 glass-card">
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
                className="p-4 rounded-xl border border-border/50 bg-card glass-card card-lift"
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

      {/* Memory Stats + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MemoryStatsCard />

        {/* Quick Actions */}
        <Card className="border-border/50 glass-card-emerald">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actions rapides</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full justify-start gap-3 float-action"
              variant="outline"
              onClick={() => setCurrentView('agents')}
            >
              <Plus className="h-4 w-4 text-primary" />
              Créer un agent
            </Button>
            <Button
              className="w-full justify-start gap-3 float-action"
              variant="outline"
              onClick={() => setCurrentView('coordination')}
            >
              <GitBranch className="h-4 w-4 text-primary" />
              Nouveau workflow
            </Button>
            <Button
              className="w-full justify-start gap-3 float-action"
              variant="outline"
              onClick={() => setCurrentView('automation')}
            >
              <Wand2 className="h-4 w-4 text-primary" />
              Lancer une commande
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Activity Pulse */}
      <Card className="border-border/50 glass-card-emerald">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Activité en temps réel
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-600 font-medium">Live</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RealtimeActivityPulse baseActivities={stats?.recentActivities || []} />
        </CardContent>
      </Card>

      {/* Recent Activity (static history) */}
      <Card className="border-border/50 card-lift">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Historique d'activité
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed activities={stats?.recentActivities || []} />
        </CardContent>
      </Card>

      {/* Tasks by Status */}
      {stats?.tasksByStatus && stats.tasksByStatus.length > 0 && (
        <Card className="border-border/50 card-lift">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Répartition des tâches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {['pending', 'running', 'completed', 'failed', 'validated'].map((status, index) => {
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
                  <motion.div
                    key={status}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 * index, type: 'spring', stiffness: 300, damping: 20 }}
                    whileHover={{ scale: 1.05 }}
                    className={`p-3 rounded-lg border text-center card-lift ${colors[status]}`}
                  >
                    <p className="text-2xl font-bold counter-glow">{count}</p>
                    <p className="text-xs mt-1">{labels[status]}</p>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
