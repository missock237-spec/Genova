'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Command,
  LayoutDashboard,
  Bot,
  Workflow,
  ShieldCheck,
  Users,
  Settings,
  CheckCheck,
  BarChart3,
  CreditCard,
  Code2,
  Mic,
  Image as ImageIcon,
  Plug,
  CalendarClock,
  FileText,
  Sparkles,
  Activity,
  Terminal,
  Cpu,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ============================================================
// CommandPalette — Cmd+K / Ctrl+K global navigation
// ============================================================
//  Inspired by Linear / Vercel / Raycast. Mounts once at the app
//  root, listens for the global shortcut, exposes a fuzzy-search
//  palette over the existing Gen3ia SPA views.
//  Uses useAppStore().setCurrentView() to navigate without a hard
//  reload (compatible with the existing SPA pattern in page.tsx).
// ============================================================

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  group: 'Navigation' | 'System' | 'External';
  action: () => void;
  keywords?: string[];
  external?: boolean;
}

interface CommandPaletteProps {
  // Injected dependency: navigate(view) - usually wraps useAppStore().setCurrentView
  onNavigate?: (view: string) => void;
}

function fuzzyMatch(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 100 - (t.indexOf(q) * 0.1);
  // Cheap fuzzy: each char of q must appear in order in t
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 50 - (t.length - q.length) * 0.01 : 0;
}

export function CommandPalette({ onNavigate }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Use a lazy import to avoid coupling at module load
  const router = useRouter();

  const navigate = useCallback(
    (view: string) => {
      if (onNavigate) {
        onNavigate(view);
      } else {
        // Fallback: push to the SPA URL
        try {
          window.history.replaceState(null, '', view === 'dashboard' ? '/' : `/${view}`);
        } catch {
          router.push(view === 'dashboard' ? '/' : `/${view}`);
        }
      }
    },
    [onNavigate, router]
  );

  // Build command registry
  const commands = useMemo<Command[]>(() => {
    const navCommands: Command[] = [
      { id: 'nav-dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, group: 'Navigation', action: () => navigate('dashboard'), keywords: ['home', 'accueil', 'overview'] },
      { id: 'nav-agents', label: 'Agents IA', icon: <Bot className="h-4 w-4" />, group: 'Navigation', action: () => navigate('agents'), keywords: ['ia', 'llm', 'gpt', 'autonomy'] },
      { id: 'nav-agent-chat', label: 'Agent Chat', icon: <Bot className="h-4 w-4" />, group: 'Navigation', action: () => navigate('agent-chat'), keywords: ['chat', 'message', 'conversation'] },
      { id: 'nav-automation', label: 'Automation', icon: <Workflow className="h-4 w-4" />, group: 'Navigation', action: () => navigate('automation'), keywords: ['workflow', 'trigger', 'pipeline'] },
      { id: 'nav-guardrails', label: 'Guardrails', icon: <ShieldCheck className="h-4 w-4" />, group: 'Navigation', action: () => navigate('guardrails'), keywords: ['safety', 'security', 'policy'] },
      { id: 'nav-coordination', label: 'Coordination', icon: <Users className="h-4 w-4" />, group: 'Navigation', action: () => navigate('coordination'), keywords: ['multi-agent', 'orchestration'] },
      { id: 'nav-approvals', label: 'Approvals', icon: <CheckCheck className="h-4 w-4" />, group: 'Navigation', action: () => navigate('approvals'), keywords: ['queue', 'review'] },
      { id: 'nav-analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" />, group: 'Navigation', action: () => navigate('analytics'), keywords: ['metrics', 'stats'] },
      { id: 'nav-billing', label: 'Billing', icon: <CreditCard className="h-4 w-4" />, group: 'Navigation', action: () => navigate('billing'), keywords: ['invoice', 'payment', 'credits'] },
      { id: 'nav-developers', label: 'Developers', icon: <Code2 className="h-4 w-4" />, group: 'Navigation', action: () => navigate('developers'), keywords: ['api', 'keys', 'mcp', 'sdk'] },
      { id: 'nav-voice', label: 'Voice', icon: <Mic className="h-4 w-4" />, group: 'Navigation', action: () => navigate('voice'), keywords: ['audio', 'stt', 'tts'] },
      { id: 'nav-images', label: 'Images', icon: <ImageIcon className="h-4 w-4" />, group: 'Navigation', action: () => navigate('images'), keywords: ['media', 'pictures'] },
      { id: 'nav-integrations', label: 'Integrations', icon: <Plug className="h-4 w-4" />, group: 'Navigation', action: () => navigate('integrations'), keywords: ['plugins', 'connectors'] },
      { id: 'nav-scheduler', label: 'Scheduler', icon: <CalendarClock className="h-4 w-4" />, group: 'Navigation', action: () => navigate('scheduler'), keywords: ['cron', 'jobs'] },
      { id: 'nav-prompts', label: 'Prompts', icon: <FileText className="h-4 w-4" />, group: 'Navigation', action: () => navigate('prompts'), keywords: ['templates'] },
      { id: 'nav-generation', label: 'Generation Workbench', icon: <Sparkles className="h-4 w-4" />, group: 'Navigation', action: () => navigate('generation'), keywords: ['create', 'ai'] },
      { id: 'nav-settings', label: 'Settings', icon: <Settings className="h-4 w-4" />, group: 'Navigation', action: () => navigate('settings'), keywords: ['preferences', 'config'] },
    ];
    const sysCommands: Command[] = [
      { id: 'sys-health', label: 'System Health', icon: <Activity className="h-4 w-4" />, group: 'System', action: () => window.open('/api/health/ready', '_blank'), keywords: ['ready', 'probe', 'liveness'] },
      { id: 'sys-metrics', label: 'Process Metrics', icon: <Cpu className="h-4 w-4" />, group: 'System', action: () => window.open('/api/metrics/system', '_blank'), keywords: ['prometheus', 'observability', 'system'] },
      { id: 'sys-terminal', label: 'Open Terminal', icon: <Terminal className="h-4 w-4" />, group: 'System', action: () => navigate('dashboard'), keywords: ['cli', 'shell'] },
    ];
    return [...navCommands, ...sysCommands];
  }, [navigate]);

  // Filtered commands
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map((c) => {
        const scoreLabel = fuzzyMatch(query, c.label);
        const scoreKeywords = (c.keywords || []).reduce(
          (max, k) => Math.max(max, fuzzyMatch(query, k)),
          0
        );
        return { c, score: Math.max(scoreLabel, scoreKeywords) };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ c }) => c);
  }, [commands, query]);

  // Group filtered commands
  const grouped = useMemo(() => {
    const g: Record<string, Command[]> = {};
    for (const c of filtered) {
      (g[c.group] = g[c.group] || []).push(c);
    }
    return g;
  }, [filtered]);

  // Reset active index on query change
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Global shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keyboard navigation within the list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd) {
        cmd.action();
        setOpen(false);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // Hide from screen readers when closed
  if (!open && typeof document !== 'undefined') {
    // remain mounted, just hidden
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="p-0 gap-0 max-w-xl overflow-hidden bg-popover/95 backdrop-blur-xl"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <DialogDescription className="sr-only">
          Recherchez une vue ou une action Gen3ia.
        </DialogDescription>

        {/* Search input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une vue, action ou commande…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Aucune commande pour « {query} »
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {Object.entries(grouped).map(([group, items]) => (
                <motion.div
                  key={group}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                    {group}
                  </div>
                  {items.map((cmd) => {
                    const idx = filtered.findIndex((c) => c.id === cmd.id);
                    const active = idx === activeIdx;
                    return (
                      <button
                        key={cmd.id}
                        data-idx={idx}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => {
                          cmd.action();
                          setOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                          active ? 'bg-emerald-500/10 text-foreground' : 'text-foreground/80 hover:bg-muted/50'
                        )}
                      >
                        <div className={cn('h-7 w-7 rounded-md flex items-center justify-center', active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-muted text-muted-foreground')}>
                          {cmd.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{cmd.label}</div>
                          {cmd.hint ? (
                            <div className="text-[10px] text-muted-foreground truncate">{cmd.hint}</div>
                          ) : null}
                        </div>
                        {cmd.group === 'System' ? (
                          <Command className="h-3 w-3 text-muted-foreground/60" />
                        ) : null}
                      </button>
                    );
                  })}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="font-mono">↑↓</kbd> naviguer
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="font-mono">↵</kbd> sélectionner
            </span>
          </div>
          <span className="inline-flex items-center gap-1">
            <Command className="h-3 w-3" />
            Gen3ia OS
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
