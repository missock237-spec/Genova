'use client';

import { useAppStore, useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Menu, Bell, Moon, Sun, Search, Zap, Clock } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore, useState, useEffect, useCallback } from 'react';

const viewTitles: Record<string, string> = {
  dashboard: 'Tableau de bord',
  agents: 'Agents IA',
  automation: 'Automatisation',
  knowledge: 'Base de connaissances',
  guardrails: 'Garde-fous',
  coordination: 'Coordination',
  settings: 'Paramètres',
};

/* ===== Live Clock Component ===== */
function LiveClock() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!time) return null;

  return (
    <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
      <Clock className="h-3 w-3" />
      <span>{time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
    </div>
  );
}

export function AppHeader() {
  const { currentView, setSidebarOpen, setCurrentView } = useAppStore();
  const { user } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mounted = useSyncExternalStore(
    (callback) => {
      window.addEventListener('resize', callback);
      return () => window.removeEventListener('resize', callback);
    },
    () => typeof window !== 'undefined',
    () => false,
  );

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      // Navigate based on search query
      const q = searchQuery.toLowerCase().trim();
      if (q.includes('agent')) setCurrentView('agents');
      else if (q.includes('workflow') || q.includes('automat')) setCurrentView('automation');
      else if (q.includes('connaiss') || q.includes('knowledge') || q.includes('rag')) setCurrentView('knowledge');
      else if (q.includes('garde') || q.includes('guard')) setCurrentView('guardrails');
      else if (q.includes('coord')) setCurrentView('coordination');
      else if (q.includes('param') || q.includes('setting')) setCurrentView('settings');
      setSearchQuery('');
    }
  }, [searchQuery, setCurrentView]);

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
          <h1 className="text-sm sm:text-base font-semibold">{viewTitles[currentView] || 'Genova'}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Live Clock */}
        <LiveClock />

        {/* Animated Search Bar */}
        <div className="hidden sm:flex items-center relative">
          <Search className={`absolute left-2.5 h-3.5 w-3.5 transition-colors duration-200 ${searchFocused ? 'text-primary' : 'text-muted-foreground'}`} />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Rechercher..."
            className={`h-8 text-xs pl-8 pr-3 rounded-full border-border/50 bg-muted/30 focus:bg-background search-input-animated transition-all ${
              searchFocused ? 'border-primary/30' : ''
            }`}
          />
        </div>

        {/* Quick Action Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 float-action quick-action-pulse text-primary"
          onClick={() => setCurrentView('agents')}
          title="Action rapide — Créer un agent"
        >
          <Zap className="h-4 w-4" />
        </Button>

        {/* Notification Bell */}
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-emerald-500 status-dot-pulse" />
        </Button>

        {/* Theme Toggle */}
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

        {/* User Avatar */}
        <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center ml-1 ring-2 ring-emerald-500/20 ring-offset-1 ring-offset-background transition-all hover:ring-emerald-500/40 cursor-default">
          <span className="text-xs font-bold text-emerald-500">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </span>
        </div>
      </div>
    </header>
  );
}
