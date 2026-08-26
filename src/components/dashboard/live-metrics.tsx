'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Wifi, WifiOff, Zap, DollarSign, Coins, Phone, Timer, BrainCircuit } from 'lucide-react';
import { createLogger } from '@/lib/logger';

const log = createLogger('live-metrics');

interface Metric {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'stable';
  icon: React.ReactNode;
}

interface LiveEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface LiveMetricsProps {
  userId: string;
  refreshInterval?: number;
}

export function LiveMetrics({ userId, refreshInterval = 5000 }: LiveMetricsProps) {
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: 'Providers actifs', value: '—', icon: <BrainCircuit className="h-5 w-5 text-blue-500" /> },
    { label: 'Requêtes/min', value: '—', icon: <Zap className="h-5 w-5 text-yellow-500" /> },
    { label: 'Coût aujourd\'hui', value: '—', icon: <DollarSign className="h-5 w-5 text-green-500" /> },
    { label: 'Crédits restants', value: '—', icon: <Coins className="h-5 w-5 text-orange-500" /> },
    { label: 'Appels vocaux', value: '—', icon: <Phone className="h-5 w-5 text-purple-500" /> },
    { label: 'Latence moyenne', value: '—', icon: <Timer className="h-5 w-5 text-cyan-500" /> },
  ]);

  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  // Ref to break self-reference cycle (connectSSE references itself via setTimeout).
  const connectSSERef = useRef<(() => EventSource) | null>(null);

  const connectSSE = useCallback(() => {
    const eventSource = new EventSource(`/api/events?userId=${userId}`);

    eventSource.onopen = () => {
      setConnected(true);
      log.info('SSE connecté au dashboard temps réel');
    };

    eventSource.addEventListener('llm_completion', (e) => {
      const data = JSON.parse(e.data);
      setEventCount(prev => prev + 1);
      setEvents(prev => [{ type: 'llm_completion', data, timestamp: data.timestamp }, ...prev].slice(0, 50));

      setMetrics(prev => prev.map(m => {
        if (m.label === 'Requêtes/min') return { ...m, value: eventCount + 1, change: 12, trend: 'up' };
        if (m.label === 'Coût aujourd\'hui') {
          const cost = (data as { data?: { costUsd?: number } })?.data?.costUsd || 0;
          const costStr = String(m.value).replace(/[^0-9.]/g, '') || '0';
        const currentCost = parseFloat(costStr);
          return { ...m, value: `${(currentCost + cost).toFixed(4)}$`, change: cost > 0 ? 5 : 0, trend: cost > 0 ? 'up' : 'stable' };
        }
        return m;
      }));
    });

    eventSource.addEventListener('voice_call', () => {
      setEvents(prev => [{ type: 'voice_call', data: {}, timestamp: new Date().toISOString() }, ...prev].slice(0, 50));
      setMetrics(prev => prev.map(m => {
        if (m.label === 'Appels vocaux') {
          const count = parseInt(String(m.value)) + 1;
          return { ...m, value: count || 1, change: 8, trend: 'up' };
        }
        return m;
      }));
    });

    eventSource.addEventListener('credit_deduction', (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [{ type: 'credit_deduction', data, timestamp: data.timestamp }, ...prev].slice(0, 50));
      setMetrics(prev => prev.map(m => {
        if (m.label === 'Crédits restants' && (data as { data?: { balance?: number } })?.data?.balance) {
          return { ...m, value: `${(data as { data: { balance: number } }).data.balance}`, change: -5, trend: 'down' };
        }
        return m;
      }));
    });

    eventSource.addEventListener('system_alert', (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [{ type: 'system_alert', data, timestamp: data.timestamp }, ...prev].slice(0, 50));
    });

    eventSource.onerror = () => {
      setConnected(false);
      log.warn('SSE déconnecté, reconnexion dans 5s');
      setTimeout(() => connectSSERef.current?.(), 5000);
    };

    return eventSource;
  }, [userId]); // [rendering-1] Retiré eventCount des deps — évite reconnexion SSE à chaque événement

  // Keep ref in sync for recursive setTimeout calls (must be in effect, not during render).
  useEffect(() => {
    connectSSERef.current = connectSSE;
  }, [connectSSE]);

  useEffect(() => {
    const eventSource = connectSSE();
    return () => eventSource.close();
  }, [connectSSE]);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">📊 Dashboard Temps Réel</h2>
        <div className="flex items-center gap-2">
          {connected ? (
            <Wifi className="h-4 w-4 text-green-500 animate-pulse" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm text-muted-foreground">
            {connected ? 'Connecté' : 'Déconnecté'}
          </span>
        </div>
      </div>

      {/* Grille de métriques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {metrics.map((metric, idx) => (
          <div
            key={idx}
            className="bg-card rounded-xl p-4 shadow-sm border border-border hover:shadow-md hover:border-primary/20 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              {metric.icon}
              {metric.change !== undefined && (
                <span className={`text-xs font-medium ${
                  metric.trend === 'up' ? 'text-green-500' :
                  metric.trend === 'down' ? 'text-red-500' :
                  'text-muted-foreground'
                }`}>
                  {metric.change > 0 ? '+' : ''}{metric.change}%
                </span>
              )}
            </div>
            <div className="text-2xl font-bold mb-1">
              {metric.value}
            </div>
            <div className="text-sm text-muted-foreground">
              {metric.label}
            </div>
          </div>
        ))}
      </div>

      {/* Flux d'événements */}
      <div className="bg-card rounded-xl shadow-sm border border-border">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            Événements en direct
          </h3>
        </div>
        <div className="divide-y divide-border max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 opacity-50" />
              <p>En attente d&apos;événements...</p>
              <p className="text-sm mt-1">Les données apparaîtront en temps réel</p>
            </div>
          ) : (
            events.map((event, idx) => (
              <div key={idx} className="p-3 hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    event.type === 'llm_completion' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                    event.type === 'voice_call' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' :
                    event.type === 'credit_deduction' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' :
                    event.type === 'system_alert' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {event.type === 'llm_completion' ? '🤖 IA' :
                     event.type === 'voice_call' ? '📞 Appel' :
                     event.type === 'credit_deduction' ? '💰 Crédit' :
                     event.type === 'system_alert' ? '⚠️ Alerte' : event.type}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-muted-foreground truncate flex-1 text-xs">
                    {JSON.stringify(event.data).slice(0, 80)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default LiveMetrics;
