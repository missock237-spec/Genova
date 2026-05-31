'use client';

import { useAppStore, useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Menu, Bell, Moon, Sun, Search, CheckCircle2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore, useState, useRef, useEffect } from 'react';

const viewTitles: Record<string, string> = {
  dashboard: 'Tableau de bord',
  agents: 'Agents IA',
  automation: 'Automatisation',
  guardrails: 'Garde-fous',
  coordination: 'Coordination',
  settings: 'Paramètres',
  approvals: 'Approbations',
};

export function AppHeader() {
  const { currentView, setSidebarOpen, pendingApprovalCount, setCurrentView } = useAppStore();
  const { user } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const mounted = useSyncExternalStore(
    (callback) => {
      window.addEventListener('resize', callback);
      return () => window.removeEventListener('resize', callback);
    },
    () => typeof window !== 'undefined',
    () => false,
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          <h1 className="text-sm sm:text-base font-semibold">{viewTitles[currentView] || 'genova.Ia'}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:flex">
          <Search className="h-4 w-4" />
        </Button>

        {/* Notifications Bell */}
        <div className="relative" ref={dropdownRef}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 relative"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
          >
            <Bell className="h-4 w-4" />
            {pendingApprovalCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-amber-500 text-[10px] text-white flex items-center justify-center font-bold">
                {pendingApprovalCount > 9 ? '9+' : pendingApprovalCount}
              </span>
            )}
          </Button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-popover border border-border/50 rounded-xl shadow-lg overflow-hidden z-50">
              <div className="p-3 border-b border-border/50">
                <h3 className="text-sm font-semibold">Notifications</h3>
              </div>
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {pendingApprovalCount > 0 ? (
                  <button
                    className="w-full p-3 text-left hover:bg-muted/50 transition-colors flex items-start gap-3"
                    onClick={() => {
                      setCurrentView('approvals');
                      setNotificationsOpen(false);
                    }}
                  >
                    <div className="p-1.5 rounded-md bg-amber-500/10 mt-0.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Approbations en attente</p>
                      <p className="text-xs text-muted-foreground">
                        {pendingApprovalCount} demande{pendingApprovalCount > 1 ? 's' : ''} d&apos;approbation en attente
                      </p>
                    </div>
                  </button>
                ) : (
                  <div className="p-6 text-center text-muted-foreground">
                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Aucune notification</p>
                  </div>
                )}
              </div>
              {pendingApprovalCount > 0 && (
                <div className="p-2 border-t border-border/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs justify-center"
                    onClick={() => {
                      setCurrentView('approvals');
                      setNotificationsOpen(false);
                    }}
                  >
                    Voir toutes les approbations
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

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
