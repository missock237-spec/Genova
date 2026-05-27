'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
} from 'lucide-react';

interface ExecutionStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'plan' | 'error' | 'result';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  timestamp: string;
  duration?: number;
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
};

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
  const errorCount = steps.filter(s => s.type === 'error').length;

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <Badge variant="outline" className="gap-1 text-[10px] h-5">
          <Timer className="h-3 w-3" /> {formatDuration(totalDuration)}
        </Badge>
        <Badge variant="outline" className="gap-1 text-[10px] h-5">
          <Brain className="h-3 w-3" /> {thoughtCount} pensée{thoughtCount !== 1 ? 's' : ''}
        </Badge>
        <Badge variant="outline" className="gap-1 text-[10px] h-5">
          <Wrench className="h-3 w-3" /> {actionCount} action{actionCount !== 1 ? 's' : ''}
        </Badge>
        {errorCount > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px] h-5 text-red-600 border-red-500/20">
            <AlertTriangle className="h-3 w-3" /> {errorCount} erreur{errorCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {isRunning && (
          <Badge className="gap-1 text-[10px] h-5 bg-emerald-600">
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

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                transition={{ duration: 0.3, delay: index * 0.02 }}
              >
                <Card className={`border ${config.borderColor} ${config.bgColor} transition-all`}>
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
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={`text-[9px] h-4 ${config.color} ${config.borderColor}`}>
                            {config.label}
                          </Badge>
                          {step.toolName && (
                            <Badge variant="secondary" className="text-[9px] h-4 gap-0.5">
                              <Zap className="h-2.5 w-2.5" /> {step.toolName}
                            </Badge>
                          )}
                          {step.duration && (
                            <span className="text-[9px] text-muted-foreground ml-auto flex-shrink-0">
                              {formatDuration(step.duration)}
                            </span>
                          )}
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
        <Card className="border-emerald-500/10">
          <CardContent className="p-3 text-center">
            <Activity className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
            <p className="text-lg font-bold">{metrics.totalTraces}</p>
            <p className="text-[10px] text-muted-foreground">Exécutions</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/10">
          <CardContent className="p-3 text-center">
            <Timer className="h-4 w-4 text-sky-500 mx-auto mb-1" />
            <p className="text-lg font-bold">{formatDuration(metrics.avgDuration)}</p>
            <p className="text-[10px] text-muted-foreground">Durée moy.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/10">
          <CardContent className="p-3 text-center">
            <DollarSign className="h-4 w-4 text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-bold">${metrics.totalCost.toFixed(3)}</p>
            <p className="text-[10px] text-muted-foreground">Coût estimé</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/10">
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
            <Card key={trace.id} className="hover:border-emerald-500/20 transition-colors">
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
