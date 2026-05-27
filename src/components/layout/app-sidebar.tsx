'use client';

import { useEffect, useState } from 'react';
import { useAppStore, useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Bot,
  Wand2,
  Shield,
  GitBranch,
  BookOpen,
  Cpu,
  LogOut,
  X,
  Activity,
  Settings,
} from 'lucide-react';

const navItems = [
  { id: 'dashboard' as const, label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'agents' as const, label: 'Agents IA', icon: Bot, showBadge: true },
  { id: 'automation' as const, label: 'Automatisation', icon: Wand2 },
  { id: 'knowledge' as const, label: 'Base de connaissances', icon: BookOpen },
  { id: 'guardrails' as const, label: 'Garde-fous', icon: Shield },
  { id: 'coordination' as const, label: 'Coordination', icon: GitBranch },
];

const bottomNavItems = [
  { id: 'settings' as const, label: 'Paramètres', icon: Settings },
];

export function AppSidebar() {
  const { currentView, setCurrentView, sidebarOpen, setSidebarOpen } = useAppStore();
  const { user, logout: storeLogout } = useAuthStore();
  const [activeAgentCount, setActiveAgentCount] = useState(0);
  const [systemStatus, setSystemStatus] = useState<'operational' | 'degraded' | 'down'>('operational');

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Best-effort: clear local state even if API fails
    }
    storeLogout();
  };

  // Fetch active agent count
  useEffect(() => {
    const fetchActiveAgents = async () => {
      if (!user?.id) return;
      try {
        const res = await fetch('/api/agents', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const active = data.filter((a: { status: string }) => a.status === 'active').length;
          setActiveAgentCount(active);
        }
      } catch {
        // ignore
      }
    };
    fetchActiveAgents();
    const interval = setInterval(fetchActiveAgents, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Check system status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/dashboard/stats', { credentials: 'include' });
        setSystemStatus(res.ok ? 'operational' : 'degraded');
      } catch {
        setSystemStatus('degraded');
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const statusColors = {
    operational: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    down: 'bg-red-500',
  };

  const statusLabels = {
    operational: 'Système opérationnel',
    degraded: 'Système dégradé',
    down: 'Système indisponible',
  };

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-sidebar border-r border-sidebar-border flex flex-col
          lg:static lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
        initial={false}
        animate={{ x: sidebarOpen || typeof window !== 'undefined' ? 0 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          transform: typeof window !== 'undefined' && !sidebarOpen && window.innerWidth < 1024
            ? 'translateX(-100%)'
            : undefined,
        }}
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.div
              className="p-1.5 rounded-lg bg-emerald-500/10"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Cpu className="h-5 w-5 text-emerald-500" />
            </motion.div>
            <div>
              <h2 className="font-bold text-sm tracking-tight">Genova</h2>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] text-muted-foreground">AI Operating System</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="relative cursor-pointer">
                      <div className={`w-1.5 h-1.5 rounded-full ${statusColors[systemStatus]}`} />
                      {systemStatus === 'operational' && (
                        <motion.div
                          className={`absolute inset-0 w-1.5 h-1.5 rounded-full ${statusColors[systemStatus]}`}
                          animate={{ scale: [1, 2, 1], opacity: [1, 0, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{statusLabels[systemStatus]}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <motion.div
                  key={item.id}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={`
                      w-full justify-start gap-3 h-10 text-sm transition-all duration-200
                      ${isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium sidebar-item-glow'
                        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                      }
                    `}
                    onClick={() => {
                      setCurrentView(item.id);
                      setSidebarOpen(false);
                    }}
                  >
                    <motion.div
                      animate={{ rotate: isActive ? 0 : 0, scale: isActive ? 1.1 : 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <item.icon className={`h-4 w-4 ${isActive ? 'text-emerald-500' : ''}`} />
                    </motion.div>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.showBadge && activeAgentCount > 0 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        <Badge className="text-[9px] h-4 min-w-[18px] justify-center bg-emerald-600 text-white px-1">
                          {activeAgentCount}
                        </Badge>
                      </motion.div>
                    )}
                  </Button>
                </motion.div>
              );
            })}
          </nav>

          {/* Bottom Nav — Settings */}
          <div className="mt-4 pt-4 border-t border-sidebar-border">
            {bottomNavItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <motion.div
                  key={item.id}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={`
                      w-full justify-start gap-3 h-10 text-sm transition-all duration-200
                      ${isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium sidebar-item-glow'
                        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                      }
                    `}
                    onClick={() => {
                      setCurrentView(item.id);
                      setSidebarOpen(false);
                    }}
                  >
                    <item.icon className={`h-4 w-4 ${isActive ? 'text-emerald-500' : ''}`} />
                    <span className="flex-1 text-left">{item.label}</span>
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </ScrollArea>

        <Separator className="bg-sidebar-border" />

        {/* System Status Footer */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
            <Activity className="h-3 w-3 text-emerald-500" />
            <span className="text-[10px] text-muted-foreground">Système</span>
            <div className="ml-auto flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${statusColors[systemStatus]}`} />
              <span className="text-[10px] font-medium text-emerald-600">
                {systemStatus === 'operational' ? 'OK' : systemStatus === 'degraded' ? 'Lent' : 'Down'}
              </span>
            </div>
          </div>
        </div>

        {/* User section */}
        <div className="p-3">
          <div className="flex items-center gap-3 p-2 rounded-lg">
            <motion.div
              className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0"
              whileHover={{ scale: 1.05 }}
            >
              <span className="text-xs font-bold text-emerald-500">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </motion.div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user?.name || 'Utilisateur'}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.plan || 'free'}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Déconnexion</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
