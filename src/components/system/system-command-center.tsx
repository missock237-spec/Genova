'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  Activity,
  Cpu,
  Database,
  Gauge,
  Zap,
  Shield,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Users,
  GitCommit,
  Rocket,
  Terminal,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// ============================================================
// SystemCommandCenter — Next-gen dashboard hero for Gen3ia OS
// ============================================================
//  Pulls live metrics from /api/health/ready + /api/metrics
//  Renders a futuristic command-center visualisation with:
//  - Glassmorphism KPI tiles with animated counters
//  - Live memory + event loop + uptime
//  - Sparkline activity charts
//  - Neon-grid hero panel
//  - Refresh + auto-refresh toggle
// ============================================================

interface MetricsSnapshot {
  status: 'pass' | 'warn' | 'fail';
  uptimeSec: number;
  checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    latencyMs: number;
    message?: string;
  }>;
  version: string;
  region?: string;
  // Raw Prometheus samples
  heapUsed?: number;
  heapTotal?: number;
  rss?: number;
  activeHandles?: number;
  cpuUserMs?: number;
  cpuSystemMs?: number;
}

interface SparklinePoint {
  t: number;
  v: number;
}

const MAX_SPARKLINE_POINTS = 30;
const REFRESH_INTERVAL_MS = 15_000;

function formatBytes(bytes?: number): string {
  if (!bytes || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let unit = 0;
  while (val >= 1024 && unit < units.length - 1) {
    val /= 1024;
    unit++;
  }
  return `${val.toFixed(val < 10 ? 1 : 0)} ${units[unit]}`;
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

// --- Hook: live metrics ---
function useLiveMetrics(autoRefresh: boolean) {
  const [data, setData] = useState<MetricsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [history, setHistory] = useState<Record<string, SparklinePoint[]>>({});
  const abortRef = useRef<AbortController | null>(null);

  const fetchMetrics = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      // Health report first (JSON), then process-level Prometheus metrics
      const [readyRes, metricsRes] = await Promise.all([
        fetch('/api/health/ready', { signal: ctrl.signal, cache: 'no-store' }),
        fetch('/api/metrics/system', { signal: ctrl.signal, cache: 'no-store' }).catch(() => null),
      ]);

      if (!readyRes.ok && readyRes.status !== 503) {
        throw new Error(`health endpoint returned ${readyRes.status}`);
      }
      const report = (await readyRes.json()) as MetricsSnapshot;

      // Parse Prometheus text format
      const snap: MetricsSnapshot = { ...report };
      if (metricsRes?.ok) {
        const text = await metricsRes.text();
        const parsed = parsePrometheus(text);
        snap.heapUsed = parsed.gen3ia_process_heap_used_bytes;
        snap.heapTotal = parsed.gen3ia_process_heap_total_bytes;
        snap.rss = parsed.gen3ia_process_rss_bytes;
        snap.activeHandles = parsed.gen3ia_process_active_handles;
        snap.cpuUserMs = parsed.gen3ia_process_cpu_user_microseconds
          ? parsed.gen3ia_process_cpu_user_microseconds / 1000
          : undefined;
        snap.cpuSystemMs = parsed.gen3ia_process_cpu_system_microseconds
          ? parsed.gen3ia_process_cpu_system_microseconds / 1000
          : undefined;
      }

      setData(snap);
      setLastUpdated(Date.now());
      setError(null);

      // Update sparkline history
      setHistory((prev) => {
        const next = { ...prev };
        const ts = Date.now();
        const push = (key: string, v: number | undefined) => {
          if (v === undefined) return;
          const arr = [...(next[key] || []), { t: ts, v }];
          if (arr.length > MAX_SPARKLINE_POINTS) arr.shift();
          next[key] = arr;
        };
        push('heap', snap.heapUsed);
        push('rss', snap.rss);
        push('handles', snap.activeHandles);
        return next;
      });
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      void fetchMetrics();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, fetchMetrics]);

  return { data, error, loading, lastUpdated, history, refresh: fetchMetrics };
}

// --- Tiny Prometheus text parser (no deps) ---
function parsePrometheus(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+([0-9eE.+-]+)$/);
    if (!m) continue;
    const key = m[1];
    const val = parseFloat(m[2]);
    if (!Number.isNaN(val)) out[key] = val;
  }
  return out;
}

// --- Sparkline (SVG) ---
function Sparkline({ data, color = 'var(--color-vermillion)' }: { data: SparklinePoint[]; color?: string }) {
  if (data.length < 2) {
    return (
      <div className="h-8 w-full flex items-end justify-center text-[10px] text-muted-foreground">
        …
      </div>
    );
  }
  const w = 100;
  const h = 30;
  const xs = data.map((_, i) => (i / (data.length - 1)) * w);
  const vals = data.map((d) => d.v);
  const vmin = Math.min(...vals);
  const vmax = Math.max(...vals);
  const range = vmax - vmin || 1;
  const ys = vals.map((v) => h - ((v - vmin) / range) * (h - 4) - 2);
  const dPath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const dArea = `${dPath} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={dArea} fill={`url(#spark-${color.replace('#', '')})`} stroke="none" />
      <path d={dPath} stroke={color} strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// --- Animated KPI tile ---
function KpiTile({
  label,
  value,
  sub,
  icon,
  tone = 'default',
  sparkline,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'success' | 'warn' | 'danger' | 'info';
  sparkline?: SparklinePoint[];
}) {
  const toneClass = {
    default: 'border-[var(--hairline-strong)]',
    success: 'border-[var(--color-moss)]/40',
    warn: 'border-[var(--color-ochre)]/40',
    danger: 'border-[var(--color-vermillion)]/40',
    info: 'border-[var(--color-ultramarine)]/40',
  }[tone];

  const sparkColor = {
    default: 'var(--color-vermillion)',
    success: 'var(--color-moss)',
    warn: 'var(--color-ochre)',
    danger: 'var(--color-vermillion)',
    info: 'var(--color-ultramarine)',
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'relative overflow-hidden rounded-sm border bg-[var(--card)]',
        toneClass
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
            {sub ? (
              <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
                {sub}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 h-8 w-8 rounded-sm border border-[var(--hairline-strong)] flex items-center justify-center">
            {icon}
          </div>
        </div>
        {sparkline && sparkline.length > 1 ? (
          <div className="mt-3 -mb-1">
            <Sparkline data={sparkline} color={sparkColor} />
          </div>
        ) : null}
      </CardContent>
    </motion.div>
  );
}

// --- Status pill ---
function StatusPill({ status }: { status: MetricsSnapshot['status'] }) {
  const map = {
    pass: { label: 'Operational', color: 'text-[var(--color-moss)] border-[var(--color-moss)]/40' },
    warn: { label: 'Degraded', color: 'text-[var(--color-ochre)] border-[var(--color-ochre)]/40' },
    fail: { label: 'Outage', color: 'text-[var(--color-vermillion)] border-[var(--color-vermillion)]/40' },
  }[status];
  return (
    <Badge className={cn('gap-1.5 font-[family-name:var(--font-geist-mono)] uppercase tracking-wider text-[0.62rem] bg-transparent', map.color)} variant="outline">
      <span className={cn('h-1.5 w-1.5 rounded-sm', {
        'bg-[var(--color-moss)]': status === 'pass',
        'bg-[var(--color-ochre)]': status === 'warn',
        'bg-[var(--color-vermillion)]': status === 'fail',
      })} />
      {map.label}
    </Badge>
  );
}

// --- Check row ---
function CheckRow({ check }: { check: MetricsSnapshot['checks'][number] }) {
  const tone = check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warn' : 'danger';
  const Icon = check.status === 'pass' ? CheckCircle2 : check.status === 'warn' ? AlertTriangle : AlertTriangle;
  const colorClass = {
    success: 'text-[var(--color-moss)]',
    warn: 'text-[var(--color-ochre)]',
    danger: 'text-[var(--color-vermillion)]',
  }[tone];
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs border-b border-[var(--hairline)] last:border-b-0">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', colorClass)} />
        <span className="font-[family-name:var(--font-geist-mono)] truncate text-[0.72rem]">{check.name}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-muted-foreground text-[0.62rem] font-[family-name:var(--font-geist-mono)]">
          {check.latencyMs}ms
        </span>
        <span className="text-muted-foreground/80 text-[0.62rem] truncate max-w-[160px]" title={check.message || ''}>
          {check.message || '—'}
        </span>
      </div>
    </div>
  );
}

// --- Main ---
export function SystemCommandCenter() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { data, error, loading, lastUpdated, history, refresh } = useLiveMetrics(autoRefresh);

  const memRatio = data?.heapTotal && data.heapUsed !== undefined && data.heapTotal > 0
    ? (data.heapUsed / data.heapTotal) * 100
    : 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-4">
        {/* Hero banner — éditorial sobre, pas de glow néon */}
        <div className="relative overflow-hidden rounded-sm border border-[var(--hairline-strong)] bg-[var(--card)] editorial-grid">
          <div className="relative p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-sm border border-[var(--color-vermillion)]/40 flex items-center justify-center text-[var(--color-vermillion)]">
                    <Terminal className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <span className="editorial-eyebrow">00 · Command Center</span>
                    <h2 className="font-[family-name:var(--font-newsreader)] text-xl sm:text-2xl italic font-medium tracking-tight mt-0.5">
                      System <em className="text-[var(--color-vermillion)] not-italic">Command Center</em>
                    </h2>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {data ? <StatusPill status={data.status} /> : null}
                <Badge variant="outline" className="text-[0.62rem] font-[family-name:var(--font-geist-mono)] uppercase tracking-wider">
                  v{data?.version ?? '…'}
                </Badge>
                {data?.region ? (
                  <Badge variant="outline" className="text-[0.62rem] font-[family-name:var(--font-geist-mono)] uppercase tracking-wider">
                    {data.region}
                  </Badge>
                ) : null}
                <button
                  onClick={() => setAutoRefresh((s) => !s)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[0.62rem] font-medium font-[family-name:var(--font-geist-mono)] uppercase tracking-wider transition-colors',
                    autoRefresh
                      ? 'border-[var(--color-vermillion)] bg-transparent text-[var(--color-vermillion)]'
                      : 'border-[var(--hairline-strong)] bg-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Zap className={cn('h-3 w-3', autoRefresh && 'fill-[var(--color-vermillion)] text-[var(--color-vermillion)]')} />
                  Live {autoRefresh ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => refresh()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--hairline-strong)] bg-transparent px-2.5 py-1 text-[0.62rem] font-medium font-[family-name:var(--font-geist-mono)] uppercase tracking-wider hover:text-[var(--color-vermillion)] hover:border-[var(--color-vermillion)] transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Tagline */}
            <p className="mt-4 max-w-2xl text-xs text-muted-foreground/80 leading-relaxed">
              Autonomous AI agents supervised by a Rust safety engine. Built on Next.js,
              Firebase, BullMQ, OpenTelemetry and Sentry. Production-hardened for
              <em className="text-[var(--color-vermillion)] not-italic font-medium"> 10,000+ concurrent users</em>.
            </p>

            {lastUpdated ? (
              <p className="mt-2 text-[0.62rem] text-muted-foreground/60 font-[family-name:var(--font-geist-mono)] uppercase tracking-wider">
                Last sync: {new Date(lastUpdated).toLocaleTimeString()} · auto-refresh every 15s
              </p>
            ) : null}
          </div>
        </div>

        {/* Error banner */}
        {error ? (
          <div className="rounded-sm border border-[var(--color-vermillion)]/40 bg-[var(--color-vermillion)]/5 px-3 py-2 text-xs text-[var(--color-vermillion)] flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Live probe failed: {error}. The dashboard will retry.
          </div>
        ) : null}

        {/* KPI tiles */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Uptime"
            value={data ? formatUptime(data.uptimeSec) : '—'}
            sub="Since last cold start"
            icon={<Activity className="h-4 w-4 text-[var(--color-moss)]" />}
            tone="success"
          />
          <KpiTile
            label="Heap Used"
            value={formatBytes(data?.heapUsed)}
            sub={`of ${formatBytes(data?.heapTotal)}`}
            icon={<Cpu className="h-4 w-4 text-[var(--color-ultramarine)]" />}
            tone={memRatio > 80 ? 'warn' : 'info'}
            sparkline={history.heap}
          />
          <KpiTile
            label="Resident Set"
            value={formatBytes(data?.rss)}
            sub="Total process memory"
            icon={<Gauge className="h-4 w-4 text-[var(--color-vermillion)]" />}
            tone="default"
            sparkline={history.rss}
          />
          <KpiTile
            label="Active Handles"
            value={data?.activeHandles?.toString() ?? '—'}
            sub="Sockets + timers"
            icon={<Zap className="h-4 w-4 text-[var(--color-ochre)]" />}
            tone={(data?.activeHandles ?? 0) > 500 ? 'warn' : 'info'}
            sparkline={history.handles}
          />
        </div>

        {/* Memory + Checks grid */}
        <div className="grid gap-3 md:grid-cols-3">
          {/* Memory progress */}
          <Card className="md:col-span-1 rounded-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-[var(--color-vermillion)]" />
                  <h3 className="text-sm font-medium font-[family-name:var(--font-newsreader)] italic">Heap Pressure</h3>
                </div>
                <span className="text-[0.62rem] font-[family-name:var(--font-geist-mono)] text-muted-foreground uppercase tracking-wider">
                  {memRatio.toFixed(1)}%
                </span>
              </div>
              <Progress value={memRatio} className="h-1.5" />
              <p className="mt-2 text-[0.62rem] text-muted-foreground font-[family-name:var(--font-geist-mono)]">
                {formatBytes(data?.heapUsed)} / {formatBytes(data?.heapTotal)}
              </p>
            </CardContent>
          </Card>

          {/* Health checks list */}
          <Card className="md:col-span-2 rounded-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[var(--color-ultramarine)]" />
                  <h3 className="text-sm font-medium font-[family-name:var(--font-newsreader)] italic">Readiness Probes</h3>
                </div>
                {data ? (
                  <span className="text-[0.62rem] font-[family-name:var(--font-geist-mono)] text-muted-foreground uppercase tracking-wider">
                    {data.checks.length} checks
                  </span>
                ) : null}
              </div>
              <div>
                {data?.checks.map((c) => (
                  <CheckRow key={c.name} check={c} />
                )) ?? (
                  <div className="py-4 text-center text-xs text-muted-foreground font-[family-name:var(--font-newsreader)] italic">
                    Loading probes…
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Architecture highlights */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ArchTile icon={<Rocket className="h-4 w-4" />} title="Edge Runtime" desc="CSP + rate limiting at the edge" />
          <ArchTile icon={<Users className="h-4 w-4" />} title="Auth Scales" desc="Firebase Auth + JWT custom claims" />
          <ArchTile icon={<GitCommit className="h-4 w-4" />} title="Audit Trail" desc="Atomic Firestore writes" />
          <ArchTile icon={<TrendingUp className="h-4 w-4" />} title="OTel + Sentry" desc="Distributed tracing + errors" />
        </div>

        {/* Footer links */}
        <div className="flex flex-wrap items-center justify-end gap-3 text-[0.62rem] text-muted-foreground font-[family-name:var(--font-geist-mono)] uppercase tracking-wider">
          <a href="/api/health" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--color-vermillion)]">
            /api/health <ArrowUpRight className="h-3 w-3" />
          </a>
          <a href="/api/health/ready" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--color-vermillion)]">
            /api/health/ready <ArrowUpRight className="h-3 w-3" />
          </a>
          <a href="/api/metrics/system" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--color-vermillion)]">
            /api/metrics/system <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </MotionConfig>
  );
}

function ArchTile({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="rounded-sm border border-[var(--hairline-strong)] bg-[var(--card)] p-3 hover:border-[var(--color-vermillion)] transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-sm border border-[var(--hairline-strong)] flex items-center justify-center text-[var(--color-vermillion)]">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium truncate font-[family-name:var(--font-newsreader)] italic">{title}</p>
          <p className="text-[0.62rem] text-muted-foreground truncate font-[family-name:var(--font-geist-mono)]">{desc}</p>
        </div>
      </div>
    </motion.div>
  );
}
