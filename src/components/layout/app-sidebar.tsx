'use client';

import { useAppStore, useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard,
  Bot,
  Wand2,
  Shield,
  GitBranch,
  Settings,
  Cpu,
  LogOut,
  X,
  CheckCircle2,
  BarChart3,
  Package,
  Link2,
} from 'lucide-react';

const navItems = [
  { id: 'dashboard' as const, label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'agents' as const, label: 'Agents IA', icon: Bot },
  { id: 'automation' as const, label: 'Automatisation', icon: Wand2 },
  { id: 'integrations' as const, label: 'Intégrations', icon: Package },
  { id: 'connectors' as const, label: 'Connecteurs', icon: Link2 },
  { id: 'guardrails' as const, label: 'Garde-fous', icon: Shield },
  { id: 'coordination' as const, label: 'Coordination', icon: GitBranch },
  { id: 'approvals' as const, label: 'Approbations', icon: CheckCircle2 },
  { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
  { id: 'settings' as const, label: 'Paramètres', icon: Settings },
];

export function AppSidebar() {
  const { currentView, setCurrentView, sidebarOpen, setSidebarOpen, pendingApprovalCount } = useAppStore();
  const { user, logout } = useAuthStore();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-sidebar border-r border-sidebar-border flex flex-col
        transform transition-transform duration-200 ease-in-out
        lg:translate-x-0 lg:static lg:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Cpu className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-tight">AgentOS</h2>
              <p className="text-[10px] text-muted-foreground">AI Operating System</p>
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
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={currentView === item.id ? 'secondary' : 'ghost'}
                className={`w-full justify-start gap-3 h-10 text-sm relative ${
                  currentView === item.id
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
                onClick={() => {
                  setCurrentView(item.id);
                  setSidebarOpen(false);
                }}
              >
                <item.icon className={`h-4 w-4 ${currentView === item.id ? 'text-primary' : ''}`} />
                {item.label}
                {item.id === 'approvals' && pendingApprovalCount > 0 && (
                  <Badge className="ml-auto bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] h-5 min-w-[20px] flex items-center justify-center">
                    {pendingApprovalCount}
                  </Badge>
                )}
              </Button>
            ))}
          </nav>
        </ScrollArea>

        <Separator className="bg-sidebar-border" />

        {/* User section */}
        <div className="p-3">
          <div className="flex items-center gap-3 p-2 rounded-lg">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user?.name || 'Utilisateur'}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.plan || 'free'}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
