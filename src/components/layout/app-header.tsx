'use client';

import { useAppStore, useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Menu, Bell, Moon, Sun, Search } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const viewTitles: Record<string, string> = {
  dashboard: 'Tableau de bord',
  agents: 'Agents IA',
  automation: 'Automatisation',
  guardrails: 'Garde-fous',
  coordination: 'Coordination',
  settings: 'Paramètres',
};

export function AppHeader() {
  const { currentView, setSidebarOpen } = useAppStore();
  const { user } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    (callback) => {
      window.addEventListener('resize', callback);
      return () => window.removeEventListener('resize', callback);
    },
    () => typeof window !== 'undefined',
    () => false,
  );

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 sm:px-6 border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-8 w-8"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-sm sm:text-base font-semibold">{viewTitles[currentView] || 'AgentOS'}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:flex">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
        </Button>
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center ml-1">
          <span className="text-xs font-bold text-primary">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </span>
        </div>
      </div>
    </header>
  );
}
