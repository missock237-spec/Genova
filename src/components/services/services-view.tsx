'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Server,
  Play,
  Square,
  RotateCcw,
  Activity,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Database,
  MessageCircle,
  Plug,
  GitBranch,
  Mic,
  ChevronDown,
  ChevronUp,
  Terminal,
  Zap,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

type ServiceStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'degraded'
  | 'stopping'
  | 'crashed'
  | 'failed';

interface ServiceSummary {
  id: string;
  name: string;
  status: ServiceStatus;
  pid: number | undefined;
  port: number;
  uptimeMs: number;
  restartCount: number;
  lastHealthCheckAt: string | null;
  lastHealthyAt: string | null;
  lastError: string | null;
  category?: string;
  description?: string;
  icon?: string;
}

interface ServiceManagerSnapshot {
  services: ServiceSummary[];
  totalServices: number;
  healthyCount: number;
  degradedCount: number;
  stoppedCount: number;
  failedCount: number;
  timestamp: string;
}

interface ServiceDetail {
  id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  status: ServiceStatus;
  pid: number | undefined;
  port: number;
  command: string;
  args: string[];
  cwd: string;
  dependsOn: string[];
  startedAt: string | null;
  lastHealthCheckAt: string | null;
  lastHealthyAt: string | null;
  restartCount: number;
  lastExitCode: number | null;
  lastExitSignal: string | null;
  lastError: string | null;
  uptimeMs: number;
  currentBackoffMs: number;
  autoRestart: boolean;
  maxRestarts: number;
}

// ============================================================
// Config
// ============================================================

const STATUS_CONFIG: Record<
  ServiceStatus,
  { label: string; color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }
> = {
  running: {
    label: 'En ligne',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    icon: CheckCircle2,
  },
  starting: {
    label: 'Démarrage',
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10 border-sky-500/20',
    icon: Loader2,
  },
  degraded: {
    label: 'Dégradé',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
    icon: AlertTriangle,
  },
  stopping: {
    label: 'Arrêt',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
    icon: Square,
  },
  stopped: {
    label: 'Arrêté',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
    icon: Square,
  },
  crashed: {
    label: 'Crashé',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10 border-red-500/20',
    icon: XCircle,
  },
  failed: {
    label: 'Échoué',
    color: 'text-red-600',
    bgColor: 'bg-red-600/10 border-red-600/20',
    icon: XCircle,
  },
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Database,
  MessageCircle,
  Plug,
  GitBranch,
  Mic,
  Server,
};

const CATEGORY_LABELS: Record<string, string> = {
  database: 'Base de données',
  communication: 'Communication',
  infrastructure: 'Infrastructure',
  automation: 'Automatisation',
  ai_ml: 'IA / ML',
  media: 'Média',
  analytics: 'Analytics',
  other: 'Autre',
};

const CATEGORY_COLORS: Record<string, string> = {
  database: 'text-cyan-500 bg-cyan-500/10',
  communication: 'text-green-500 bg-green-500/10',
  infrastructure: 'text-purple-500 bg-purple-500/10',
  automation: 'text-orange-500 bg-orange-500/10',
  ai_ml: 'text-pink-500 bg-pink-500/10',
  media: 'text-amber-500 bg-amber-500/10',
  analytics: 'text-teal-500 bg-teal-500/10',
  other: 'text-slate-500 bg-slate-500/10',
};

// ============================================================
// Helpers
// ============================================================

function formatUptime(ms: number): string {
  if (ms <= 0) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}j ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "À l'instant";
  return formatUptime(diff) + ' ago';
}

// ============================================================
// Main Component
// ============================================================

export function ServicesView() {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<ServiceManagerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    serviceId: string;
    action: 'start' | 'stop' | 'restart';
  } | null>(null);
  const [detailServiceId, setDetailServiceId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<ServiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logsServiceId, setLogsServiceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch snapshot
  const fetchSnapshot = useCallback(async () => {
    try {
      const data = await apiFetch<ServiceManagerSnapshot>('/api/services');
      setSnapshot(data);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling
  useEffect(() => {
    fetchSnapshot();
    pollRef.current = setInterval(fetchSnapshot, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchSnapshot]);

  // Service action
  const handleAction = async (serviceId: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading(serviceId + action);
    try {
      await apiFetch(`/api/services/${serviceId}/${action}`, { method: 'POST' });
      toast({
        title: action === 'start' ? 'Démarrage' : action === 'stop' ? 'Arrêt' : 'Redémarrage',
        description: `${serviceId} — ${action === 'start' ? 'démarrage en cours' : action === 'stop' ? 'arrêt en cours' : 'redémarrage en cours'}`,
      });
      setTimeout(fetchSnapshot, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  // Start all
  const handleStartAll = async () => {
    setActionLoading('__all__');
    try {
      await apiFetch('/api/services', {
        method: 'POST',
        body: JSON.stringify({ action: 'start' }),
      });
      toast({ title: 'Démarrage', description: 'Tous les services sont en cours de démarrage' });
      setTimeout(fetchSnapshot, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  // Stop all
  const handleStopAll = async () => {
    setActionLoading('__all_stop__');
    try {
      await apiFetch('/api/services', {
        method: 'POST',
        body: JSON.stringify({ action: 'stop' }),
      });
      toast({ title: 'Arrêt', description: "Tous les services sont en cours d'arrêt" });
      setTimeout(fetchSnapshot, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  // Open detail
  const openDetail = async (serviceId: string) => {
    setDetailServiceId(serviceId);
    setDetailLoading(true);
    try {
      const data = await apiFetch<ServiceDetail>(`/api/services/${serviceId}`);
      setDetailData(data);
    } catch {
      // silent
    } finally {
      setDetailLoading(false);
    }
  };

  // Open logs
  const openLogs = async (serviceId: string) => {
    setLogsServiceId(serviceId);
    setLogsLoading(true);
    try {
      const data = await apiFetch<{ logs: string[] }>(`/api/services/${serviceId}/logs?lines=200`);
      setLogs(data.logs || []);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const services = snapshot?.services || [];
  const healthyCount = snapshot?.healthyCount || 0;
  const degradedCount = snapshot?.degradedCount || 0;
  const stoppedCount = snapshot?.stoppedCount || 0;
  const failedCount = snapshot?.failedCount || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Gestionnaire de Services
          </h2>
          <p className="text-sm text-muted-foreground">
            Surveillez et gérez les microservices Genova
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="gap-2"
            onClick={handleStartAll}
            disabled={!!actionLoading}
          >
            {actionLoading === '__all__' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Tout démarrer
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={handleStopAll}
            disabled={!!actionLoading}
          >
            {actionLoading === '__all_stop__' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            Tout arrêter
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-2"
            onClick={fetchSnapshot}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{healthyCount}</p>
              <p className="text-xs text-muted-foreground">En ligne</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{degradedCount}</p>
              <p className="text-xs text-muted-foreground">Dégradé</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/10">
              <Square className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stoppedCount}</p>
              <p className="text-xs text-muted-foreground">Arrêté</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{failedCount}</p>
              <p className="text-xs text-muted-foreground">Échoué</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service List */}
      <div className="space-y-3">
        {services.map((service) => {
          const statusConfig = STATUS_CONFIG[service.status];
          const StatusIcon = statusConfig.icon;
          const ServiceIcon = ICON_MAP[service.icon || ''] || Server;
          const categoryColor = CATEGORY_COLORS[service.category || 'other'] || CATEGORY_COLORS.other;
          const isExpanded = expandedService === service.id;
          const isAnimating =
            actionLoading === service.id + 'start' ||
            actionLoading === service.id + 'stop' ||
            actionLoading === service.id + 'restart';

          return (
            <Card key={service.id} className="border-border/50 overflow-hidden">
              <CardContent className="p-0">
                {/* Service Header Row */}
                <div className="flex items-center gap-3 p-4">
                  {/* Icon */}
                  <div className={`p-2.5 rounded-lg ${categoryColor.split(' ')[1]}`}>
                    <ServiceIcon className={`h-5 w-5 ${categoryColor.split(' ')[0]}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium truncate">{service.name}</h3>
                      <Badge
                        variant="outline"
                        className={`${statusConfig.bgColor} ${statusConfig.color} text-[10px] px-2 shrink-0`}
                      >
                        {service.status === 'starting' || service.status === 'stopping' ? (
                          <StatusIcon className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <StatusIcon className="h-3 w-3 mr-1" />
                        )}
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        Port {service.port}
                      </span>
                      {service.pid && (
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          PID {service.pid}
                        </span>
                      )}
                      {service.uptimeMs > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatUptime(service.uptimeMs)}
                        </span>
                      )}
                      {service.category && (
                        <span className="hidden sm:inline">
                          {CATEGORY_LABELS[service.category] || service.category}
                        </span>
                      )}
                    </div>
                    {service.lastError && (
                      <p className="text-[10px] text-red-400 mt-1 truncate max-w-md">
                        {service.lastError}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(service.status === 'stopped' || service.status === 'crashed' || service.status === 'failed') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => setConfirmAction({ serviceId: service.id, action: 'start' })}
                        disabled={isAnimating}
                      >
                        {isAnimating && actionLoading === service.id + 'start' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden sm:inline">Démarrer</span>
                      </Button>
                    )}
                    {(service.status === 'running' || service.status === 'degraded' || service.status === 'starting') && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => setConfirmAction({ serviceId: service.id, action: 'restart' })}
                          disabled={isAnimating}
                        >
                          {isAnimating && actionLoading === service.id + 'restart' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">Redémarrer</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 text-xs text-red-500 hover:text-red-600"
                          onClick={() => setConfirmAction({ serviceId: service.id, action: 'stop' })}
                          disabled={isAnimating}
                        >
                          {isAnimating && actionLoading === service.id + 'stop' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Square className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">Arrêter</span>
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => setExpandedService(isExpanded ? null : service.id)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <>
                    <Separator />
                    <div className="p-4 bg-muted/20 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">Dernier health check</span>
                          <p className="font-medium">{formatRelativeTime(service.lastHealthCheckAt)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Dernier état sain</span>
                          <p className="font-medium">{formatRelativeTime(service.lastHealthyAt)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Redémarrages</span>
                          <p className="font-medium">{service.restartCount}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => openDetail(service.id)}
                        >
                          <Server className="h-3 w-3" />
                          Détails
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => openLogs(service.id)}
                        >
                          <Terminal className="h-3 w-3" />
                          Logs
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Confirm Action Dialog */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === 'start' && 'Démarrer ce service ?'}
              {confirmAction?.action === 'stop' && 'Arrêter ce service ?'}
              {confirmAction?.action === 'restart' && 'Redémarrer ce service ?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === 'start' &&
                `Le service ${confirmAction?.serviceId} sera démarré. Cela peut prendre quelques secondes.`}
              {confirmAction?.action === 'stop' &&
                `Le service ${confirmAction?.serviceId} sera arrêté. Les requêtes en cours pourraient être interrompues.`}
              {confirmAction?.action === 'restart' &&
                `Le service ${confirmAction?.serviceId} sera redémarré. Une brève interruption de service est à prévoir.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction) {
                  handleAction(confirmAction.serviceId, confirmAction.action);
                }
              }}
              className={
                confirmAction?.action === 'stop'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {confirmAction?.action === 'start' && 'Démarrer'}
              {confirmAction?.action === 'stop' && 'Arrêter'}
              {confirmAction?.action === 'restart' && 'Redémarrer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailServiceId} onOpenChange={(open) => { if (!open) setDetailServiceId(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              {detailData?.name || detailServiceId}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : detailData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Statut</span>
                  <p>
                    <Badge variant="outline" className={`${STATUS_CONFIG[detailData.status].bgColor} ${STATUS_CONFIG[detailData.status].color} text-xs`}>
                      {STATUS_CONFIG[detailData.status].label}
                    </Badge>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">PID</span>
                  <p className="font-medium">{detailData.pid || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Port</span>
                  <p className="font-medium">{detailData.port}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Uptime</span>
                  <p className="font-medium">{formatUptime(detailData.uptimeMs)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Commande</span>
                  <p className="font-mono text-xs break-all">{detailData.command} {detailData.args.join(' ')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Répertoire</span>
                  <p className="font-mono text-xs break-all">{detailData.cwd}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Dépend de</span>
                  <p className="font-medium">
                    {detailData.dependsOn.length > 0 ? detailData.dependsOn.join(', ') : 'Aucune'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Auto-restart</span>
                  <p className="font-medium">{detailData.autoRestart ? 'Oui' : 'Non'} ({detailData.maxRestarts} max)</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Redémarrages</span>
                  <p className="font-medium">{detailData.restartCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Dernier exit code</span>
                  <p className="font-medium">{detailData.lastExitCode ?? '—'}</p>
                </div>
              </div>
              {detailData.lastError && (
                <div>
                  <span className="text-muted-foreground text-xs">Dernière erreur</span>
                  <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded mt-1 font-mono break-all">
                    {detailData.lastError}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Impossible de charger les détails</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={!!logsServiceId} onOpenChange={(open) => { if (!open) setLogsServiceId(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              Logs — {logsServiceId}
            </DialogTitle>
          </DialogHeader>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <ScrollArea className="h-96 bg-zinc-950 rounded-lg p-3">
              {logs.length === 0 ? (
                <p className="text-sm text-zinc-500 font-mono">Aucun log disponible</p>
              ) : (
                <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap">
                  {logs.join('\n')}
                </pre>
              )}
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
