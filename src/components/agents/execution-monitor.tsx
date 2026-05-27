'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Wrench,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  Cpu,
  Timer,
  DollarSign,
  Activity,
  RefreshCw,
  RotateCcw,
  Lightbulb,
  BrainCircuit,
} from 'lucide-react';

interface ExecutionStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'plan' | 'error' | 'result' | 'reflection' | 'correction' | 'retry';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  timestamp: string;
  duration?: number;
  confidence?: number;
}

interface ExecutionTrace {
  id: string;
  agentId: string;
  task: string;
  status: string;
  totalDuration?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | null;
  createdAt: string;
}

/* ===== Step Configuration with new types ===== */
const stepConfig: Record<string, { icon: typeof Brain; label: string; color: string; bgColor: string; borderColor: string }> = {
  thought: {
    icon: Brain,
    label: 'Pensée',
    color: 'text-violet-600',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/20',
  },
  action: {
    icon: Wrench,
    label: 'Action',
    color: 'text-sky-600',
    bgColor: 'bg-sky-500/10',
    borderColor: 'border-sky-500/20',
  },
  observation: {
    icon: Eye,
    label: 'Observation',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
  },
  error: {
    icon: AlertTriangle,
    label: 'Erreur',
    color: 'text-red-600',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
  },
  result: {
    icon: CheckCircle2,
    label: 'Résultat',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
  },
  plan: {
    icon: Activity,
    label: 'Plan',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
  },
  reflection: {
    icon: BrainCircuit,
    label: 'Réflexion',
    color: 'text-purple-600',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
  },
  correction: {
    icon: RefreshCw,
    label: 'Correction',
    color: 'text-orange-600',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
  },
  retry: {
    icon: RotateCcw,
    label: 'Retry',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
  },
};

/* ===== Phase Cycle Indicator ===== */
const PHASE_CYCLE = ['think', 'act', 'observe', 'reflect', 'retry'] as const;
const PHASE_LABELS: Record<string, string> = {
  think: 'Think',
  act: 'Act',
  observe: 'Observe',
  reflect: 'Reflect',
  retry: 'Retry',
};
const PHASE_ICONS: Record<string, typeof Brain> = {
  think: Lightbulb,
  act: Zap,
  observe: Eye,
  reflect: BrainCircuit,
  retry: RotateCcw,
};
const PHASE_COLORS: Record<string, string> = {
  think: 'text-violet-500',
  act: 'text-sky-500',
  observe: 'text-emerald-500',
  reflect: 'text-purple-500',
  retry: 'text-amber-500',
};
const PHASE_BG: Record<string, string> = {
  think: 'bg-violet-500/10',
  act: 'bg-sky-500/10',
  observe: 'bg-emerald-500/10',
  reflect: 'bg-purple-500/10',
  retry: 'bg-amber-500/10',
};

function getPhaseFromStepType(type: string): string {
  if (type === 'thought') return 'think';
  if (type === 'action') return 'act';
  if (type === 'observation') return 'observe';
  if (type === 'reflection') return 'reflect';
  if (type === 'correction' || type === 'retry') return 'retry';
  if (type === 'plan') return 'think';
  if (type === 'result') return 'observe';
  if (type === 'error') return 'retry';
  return 'think';
}

function PhaseCycleIndicator({ currentPhase }: { currentPhase: string }) {
  return (
    <div className="flex items-center gap-1">
      {PHASE_CYCLE.map((phase, i) => {
        const Icon = PHASE_ICONS[phase];
        const isActive = currentPhase === phase;
        return (
          <div key={phase} className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.div
                  animate={{
                    scale: isActive ? 1.1 : 1,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className={`
                    flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-300
                    ${isActive
                      ? `${PHASE_BG[phase]} ${PHASE_COLORS[phase]} border border-current/20 animate-pulse-glow`
                      : 'text-muted-foreground/50'
                    }
                  `}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{PHASE_LABELS[phase]}</span>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Phase: {PHASE_LABELS[phase]}</p>
              </TooltipContent>
            </Tooltip>
            {i < PHASE_CYCLE.length - 1 && (
              <div className={`w-3 h-px ${isActive ? 'bg-emerald-500/50' : 'bg-muted-foreground/20'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ===== Mini State Graph ===== */
function MiniStateGraph({ currentPhase }: { currentPhase: string }) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      {PHASE_CYCLE.map((phase, i) => {
        const isActive = currentPhase === phase;
        const Icon = PHASE_ICONS[phase];
        return (
          <div key={phase} className="flex items-center">
            <motion.div
              animate={{
                scale: isActive ? 1.2 : 0.85,
                opacity: isActive ? 1 : 0.4,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className={`
                w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-300
                ${isActive
                  ? `${PHASE_BG[phase]} ${PHASE_COLORS[phase]} ring-2 ring-current/30`
                  : 'bg-muted/50 text-muted-foreground'
                }
              `}
            >
              <Icon className="h-3 w-3" />
            </motion.div>
            {i < PHASE_CYCLE.length - 1 && (
              <motion.div
                animate={{
                  backgroundColor: isActive ? 'oklch(0.696 0.17 162.48 / 0.5)' : 'oklch(0.5 0 0 / 0.1)',
                  width: isActive ? 16 : 8,
                }}
                className="h-0.5 rounded-full"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ===== Confidence Bar ===== */
function ConfidenceBar({ value }: { value?: number }) {
  if (value === undefined || value === null) return null;
  const clampedValue = Math.max(0, Math.min(100, value));
  const color = clampedValue >= 70 ? 'bg-emerald-500' : clampedValue >= 40 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-muted-foreground">Conf.</span>
      <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${clampedValue}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[9px] text-muted-foreground">{clampedValue}%</span>
    </div>
  );
}

/* ===== Execution Monitor Component ===== */
export function ExecutionMonitor({
  steps,
  isRunning = false,
  agentName = 'Agent',
  task = '',
}: {
  steps: ExecutionStep[];
  isRunning?: boolean;
  agentName?: string;
  task?: string;
}) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const stepsEndRef = useRef<HTMLDivElement>(null);

  // Compute current phase from the latest step
  const currentPhase = steps.length > 0
    ? getPhaseFromStepType(steps[steps.length - 1].type)
    : 'think';

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const toggleStep = (id: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const totalDuration = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
  const thoughtCount = steps.filter(s => s.type === 'thought').length;
  const actionCount = steps.filter(s => s.type === 'action').length;
  const reflectionCount = steps.filter(s => s.type === 'reflection').length;
  const correctionCount = steps.filter(s => s.type === 'correction').length;
  const retryCount = steps.filter(s => s.type === 'retry').length;
  const errorCount = steps.filter(s => s.type === 'error').length;

  return (
    <div className="flex flex-col h-full">
      {/* Phase cycle indicator */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-3 gap-2 flex-wrap"
      >
        <PhaseCycleIndicator currentPhase={currentPhase} />
        <MiniStateGraph currentPhase={currentPhase} />
      </motion.div>

      {/* Stats bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Badge variant="outline" className="gap-1 text-[10px] h-5">
          <Timer className="h-3 w-3" /> {formatDuration(totalDuration)}
        </Badge>
        <Badge variant="outline" className="gap-1 text-[10px] h-5">
          <Brain className="h-3 w-3" /> {thoughtCount} pensée{thoughtCount !== 1 ? 's' : ''}
        </Badge>
        <Badge variant="outline" className="gap-1 text-[10px] h-5">
          <Wrench className="h-3 w-3" /> {actionCount} action{actionCount !== 1 ? 's' : ''}
        </Badge>
        {reflectionCount > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px] h-5 text-purple-600 border-purple-500/20">
            <BrainCircuit className="h-3 w-3" /> {reflectionCount} réflexion{reflectionCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {correctionCount > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px] h-5 text-orange-600 border-orange-500/20">
            <RefreshCw className="h-3 w-3" /> {correctionCount} correction{correctionCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {retryCount > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px] h-5 text-amber-600 border-amber-500/20">
            <RotateCcw className="h-3 w-3" /> {retryCount} retry{retryCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {errorCount > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px] h-5 text-red-600 border-red-500/20">
            <AlertTriangle className="h-3 w-3" /> {errorCount} erreur{errorCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {isRunning && (
          <Badge className="gap-1 text-[10px] h-5 bg-emerald-600 animate-pulse-glow">
            <Loader2 className="h-3 w-3 animate-spin" /> En cours
          </Badge>
        )}
      </div>

      {/* Execution timeline */}
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
        {steps.length === 0 && !isRunning && (
          <div className="text-center py-8">
            <Cpu className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aucune exécution en cours</p>
            <p className="text-xs text-muted-foreground">Lancez une tâche pour voir les étapes de l&apos;agent</p>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {steps.map((step, index) => {
            const config = stepConfig[step.type] || stepConfig.thought;
            const Icon = config.icon;
            const isExpanded = expandedSteps.has(step.id);
            const hasDetails = Boolean((step.toolInput && Object.keys(step.toolInput as Record<string, unknown>).length > 0) || step.toolOutput);
            const isLatestStep = index === steps.length - 1 && isRunning;

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                transition={{ duration: 0.3, delay: index * 0.02 }}
              >
                <Card className={`border ${config.borderColor} ${config.bgColor} transition-all ${isLatestStep ? 'animate-pulse-glow' : ''}`}>
                  <CardContent
                    className={`p-3 ${hasDetails ? 'cursor-pointer' : ''}`}
                    onClick={() => hasDetails && toggleStep(step.id)}
                  >
                    <div className="flex items-start gap-2">
                      {/* Step number and icon */}
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        <div className={`w-7 h-7 rounded-full ${config.bgColor} flex items-center justify-center`}>
                          <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                        </div>
                        {index < steps.length - 1 && (
                          <div className="w-0.5 h-3 bg-border/50" />
                        )}
                      </div>

                      {/* Step content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className={`text-[9px] h-4 ${config.color} ${config.borderColor}`}>
                            {config.label}
                          </Badge>
                          {step.toolName && (
                            <Badge variant="secondary" className="text-[9px] h-4 gap-0.5">
                              <Zap className="h-2.5 w-2.5" /> {step.toolName}
                            </Badge>
                          )}
                          {step.duration && (
                            <span className="text-[9px] text-muted-foreground flex-shrink-0">
                              {formatDuration(step.duration)}
                            </span>
                          )}
                          <ConfidenceBar value={step.confidence} />
                          {hasDetails ? (
                            isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground ml-auto flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto flex-shrink-0" />
                            )
                          ) : null}
                        </div>
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {step.content.length > 500 && !isExpanded
                            ? step.content.substring(0, 500) + '...'
                            : step.content
                          }
                        </p>

                        {/* Expanded details */}
                        <AnimatePresence>
                          {isExpanded && hasDetails ? (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-2 space-y-2"
                            >
                              {step.toolInput && Object.keys(step.toolInput as Record<string, unknown>).length > 0 && (
                                <div className="p-2 rounded-md bg-background/50 border border-border/50">
                                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Paramètres:</p>
                                  <pre className="text-xs whitespace-pre-wrap break-words">
                                    {JSON.stringify(step.toolInput, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {step.toolOutput !== undefined && step.toolOutput !== null && (
                                <div className="p-2 rounded-md bg-background/50 border border-border/50">
                                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Résultat:</p>
                                  <pre className="text-xs whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                                    {typeof step.toolOutput === 'string'
                                      ? step.toolOutput
                                      : JSON.stringify(step.toolOutput, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Running indicator */}
        {isRunning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 py-2"
          >
            <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />
            <span className="text-xs text-muted-foreground">L&apos;agent réfléchit...</span>
            <div className="flex gap-1 ml-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 typing-dot-improved" />
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 typing-dot-improved" />
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 typing-dot-improved" />
            </div>
          </motion.div>
        )}

        <div ref={stepsEndRef} />
      </div>
    </div>
  );
}

/**
 * Historical execution traces list
 */
export function ExecutionTraces({ userId }: { userId: string }) {
  const [traces, setTraces] = useState<ExecutionTrace[]>([]);
  const [metrics, setMetrics] = useState({
    totalTraces: 0,
    avgDuration: 0,
    totalCost: 0,
    errorRate: 0,
    totalTokens: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTraces();
  }, [userId]);

  const loadTraces = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/observability/traces?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setTraces(data.traces || []);
        setMetrics(data.metrics || metrics);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms?: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metrics cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-emerald-500/10 glass-card-emerald">
          <CardContent className="p-3 text-center">
            <Activity className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
            <p className="text-lg font-bold">{metrics.totalTraces}</p>
            <p className="text-[10px] text-muted-foreground">Exécutions</p>
          </CardContent>
        </Card>
        <Card className="border-sky-500/10">
          <CardContent className="p-3 text-center">
            <Timer className="h-4 w-4 text-sky-500 mx-auto mb-1" />
            <p className="text-lg font-bold">{formatDuration(metrics.avgDuration)}</p>
            <p className="text-[10px] text-muted-foreground">Durée moy.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/10">
          <CardContent className="p-3 text-center">
            <DollarSign className="h-4 w-4 text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-bold">${metrics.totalCost.toFixed(3)}</p>
            <p className="text-[10px] text-muted-foreground">Coût estimé</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/10">
          <CardContent className="p-3 text-center">
            <AlertTriangle className="h-4 w-4 text-red-500 mx-auto mb-1" />
            <p className="text-lg font-bold">{(metrics.errorRate * 100).toFixed(0)}%</p>
            <p className="text-[10px] text-muted-foreground">Taux d&apos;erreur</p>
          </CardContent>
        </Card>
      </div>

      {/* Traces list */}
      <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
        {traces.length === 0 ? (
          <div className="text-center py-6">
            <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Aucune trace d&apos;exécution</p>
          </div>
        ) : (
          traces.map((trace) => (
            <Card key={trace.id} className="hover:border-emerald-500/20 transition-colors glass-card">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{trace.task}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant="outline"
                        className={
                          trace.status === 'completed'
                            ? 'text-emerald-600 border-emerald-500/20 text-[9px] h-4'
                            : trace.status === 'failed'
                            ? 'text-red-600 border-red-500/20 text-[9px] h-4'
                            : 'text-amber-600 border-amber-500/20 text-[9px] h-4'
                        }
                      >
                        {trace.status === 'completed' ? 'Terminé' : trace.status === 'failed' ? 'Échoué' : 'En cours'}
                      </Badge>
                      {trace.totalDuration && (
                        <span className="text-[10px] text-muted-foreground">{formatDuration(trace.totalDuration)}</span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-[10px] h-6">
                    Détails
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
