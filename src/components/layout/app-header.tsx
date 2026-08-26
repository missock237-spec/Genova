'use client';

import { useAuthStore, useAppStore, useModernStore } from '@/lib/store';
import { Bell, Search, Sun, Moon, Menu, Wallet, User, Settings, LogOut, ChevronDown } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface AppHeaderProps {
  onMenuClick?: () => void;
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const { user, logout } = useAuthStore();
  const { approvalCount } = useAppStore();
  const { unreadCount, toggleSidebar } = useModernStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Fetch credits
  useEffect(() => {
    async function loadCredits() {
      try {
        const res = await fetch('/api/billing');
        if (res.ok) {
          const data = await res.json();
          if (data?.creditsRemaining !== undefined) {
            setCredits(data.creditsRemaining);
            return;
          }
        }
      } catch {}
      // Fallback: try dashboard
      try {
        const res = await fetch('/api/dashboard');
        if (res.ok) {
          const data = await res.json();
          if (data?.creditsRemaining !== undefined) {
            setCredits(data.creditsRemaining);
          }
        }
      } catch {}
    }
    loadCredits();
  }, []);

  if (!mounted) {
    return (
      <header className="h-14 border-b border-[#1C1E22] bg-[#0E0F11]/70 backdrop-blur-md flex items-center px-4">
        <div className="w-8 h-8 bg-[#131417] rounded-lg animate-pulse" />
        <div className="w-48 h-9 bg-[#131417] rounded-lg animate-pulse ml-auto" />
      </header>
    );
  }

  const totalBadge = (unreadCount || 0) + (approvalCount || 0);

  return (
    <header className="glass h-14 flex items-center justify-between px-4 gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Hamburger menu for mobile */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-[rgba(0,245,255,0.08)] text-[#8A9099] hover:text-[#00F5FF] shrink-0 transition-colors"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Desktop sidebar toggle */}
        <button
          onClick={toggleSidebar}
          className="hidden lg:flex p-2 rounded-lg hover:bg-[rgba(0,245,255,0.08)] text-[#8A9099] hover:text-[#00F5FF] shrink-0 transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Search */}
        {searchOpen ? (
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A9099]" />
            <input
              type="text"
              placeholder="Rechercher agents, workflows, paramètres..."
              autoFocus
              onBlur={() => setSearchOpen(false)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-[#1C1E22] bg-[#0A0A0B] text-sm text-[#E6E8EC] placeholder:text-[#8A9099]/60 focus:outline-none focus:ring-2 focus:ring-[#00F5FF]/30 focus:border-[#00F5FF]/40 transition-all"
            />
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1C1E22] hover:border-[rgba(0,245,255,0.2)] hover:bg-[rgba(0,245,255,0.04)] text-[#8A9099] text-sm flex-1 max-w-xs sm:max-w-md transition-all"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline truncate">Rechercher...</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 ml-auto text-[10px] text-[#8A9099]/50 border border-[#1C1E22] rounded px-1.5 py-0.5 font-mono">
              ⌘K
            </kbd>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Credits display */}
        {credits !== null && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#1C1E22] text-xs">
            <Wallet className="h-3.5 w-3.5 text-[#FFB800]" />
            <span className="text-[#8A9099]">Credits</span>
            <span className="font-semibold text-[#E6E8EC] font-mono">{credits.toLocaleString()}</span>
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg hover:bg-[rgba(0,245,255,0.08)] text-[#8A9099] hover:text-[#00F5FF] transition-colors"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notification bell */}
        <button className="relative p-2 rounded-lg hover:bg-[rgba(0,245,255,0.08)] text-[#8A9099] hover:text-[#00F5FF] transition-colors">
          <Bell className="h-4 w-4" />
          {totalBadge > 0 && (
            <span className="relative flex h-4 w-4">
              <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-[#00F5FF] opacity-75" />
              <span className="relative inline-flex items-center justify-center h-4 w-4 rounded-full bg-[#00F5FF] text-[#001416] text-[9px] font-bold">
                {totalBadge > 9 ? '9+' : totalBadge}
              </span>
            </span>
          )}
        </button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              'flex items-center gap-2 ml-1 sm:ml-2 pl-2 sm:pl-2.5 pr-1.5 py-1 rounded-lg',
              'border border-transparent hover:border-[#1C1E22] hover:bg-[rgba(0,245,255,0.04)] transition-all'
            )}>
              <div className="w-8 h-8 rounded-lg bg-[rgba(0,245,255,0.12)] border border-[rgba(0,245,255,0.2)] flex items-center justify-center text-xs font-semibold text-[#00F5FF]">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <span className="text-sm font-medium hidden md:block truncate max-w-32 text-[#E6E8EC]">
                {user?.name || 'Utilisateur'}
              </span>
              <ChevronDown className="h-3 w-3 text-[#8A9099] hidden md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-[#0E0F11] border-[#1C1E22]"
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium text-[#E6E8EC]">{user?.name || 'Utilisateur'}</p>
                <p className="text-xs text-[#8A9099] font-mono">{user?.email || ''}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#1C1E22]" />
            <DropdownMenuItem className="text-[#8A9099] hover:text-[#E6E8EC] hover:bg-[rgba(0,245,255,0.08)] focus:bg-[rgba(0,245,255,0.08)] cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="text-[#8A9099] hover:text-[#E6E8EC] hover:bg-[rgba(0,245,255,0.08)] focus:bg-[rgba(0,245,255,0.08)] cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#1C1E22]" />
            <DropdownMenuItem
              className="text-[#FF5C5C] hover:text-[#FF5C5C] hover:bg-[rgba(255,92,92,0.08)] focus:bg-[rgba(255,92,92,0.08)] cursor-pointer"
              onClick={() => { void logout(); }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
