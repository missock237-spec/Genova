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

/**
 * Header — Editorial Instrument
 * Hairline border, opaque background, accent vermillon, plus de glow néon.
 */
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
      <header className="h-14 border-b border-[var(--hairline-strong)] bg-background flex items-center px-4">
        <div className="w-8 h-8 bg-[var(--secondary)] rounded-sm animate-pulse" />
        <div className="w-48 h-9 bg-[var(--secondary)] rounded-sm animate-pulse ml-auto" />
      </header>
    );
  }

  const totalBadge = (unreadCount || 0) + (approvalCount || 0);

  return (
    <header className="h-14 flex items-center justify-between px-4 gap-3 border-b border-[var(--hairline-strong)] bg-background">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Hamburger mobile */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-sm hover:bg-[var(--secondary)] text-muted-foreground hover:text-[var(--color-vermillion)] shrink-0 transition-colors"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Toggle sidebar desktop */}
        <button
          onClick={toggleSidebar}
          className="hidden lg:flex p-2 rounded-sm hover:bg-[var(--secondary)] text-muted-foreground hover:text-[var(--color-vermillion)] shrink-0 transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Recherche */}
        {searchOpen ? (
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher agents, workflows, paramètres..."
              autoFocus
              onBlur={() => setSearchOpen(false)}
              className="w-full pl-9 pr-4 py-2 rounded-sm border border-[var(--hairline-strong)] bg-background text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-[var(--color-vermillion)] focus:border-[var(--color-vermillion)] transition-all"
            />
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-sm border border-[var(--hairline-strong)] hover:border-[var(--color-vermillion)] hover:bg-[var(--secondary)] text-muted-foreground text-sm flex-1 max-w-xs sm:max-w-md transition-all"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline truncate">Rechercher...</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 ml-auto text-[0.62rem] text-muted-foreground/60 border border-[var(--hairline-strong)] rounded-sm px-1.5 py-0.5 font-[family-name:var(--font-geist-mono)] uppercase tracking-wider">
              ⌘K
            </kbd>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* Crédits */}
        {credits !== null && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-[var(--hairline-strong)] text-xs">
            <Wallet className="h-3.5 w-3.5 text-[var(--color-ochre)]" />
            <span className="text-muted-foreground uppercase tracking-wider text-[0.62rem]">crédits</span>
            <span className="font-semibold font-[family-name:var(--font-geist-mono)]">{credits.toLocaleString()}</span>
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-sm hover:bg-[var(--secondary)] text-muted-foreground hover:text-[var(--color-vermillion)] transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Cloche de notifications */}
        <button className="relative p-2 rounded-sm hover:bg-[var(--secondary)] text-muted-foreground hover:text-[var(--color-vermillion)] transition-colors" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {totalBadge > 0 && (
            <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 flex items-center justify-center bg-[var(--color-vermillion)] text-[var(--color-bone)] text-[0.62rem] font-semibold font-[family-name:var(--font-geist-mono)] rounded-sm">
              {totalBadge > 9 ? '9+' : totalBadge}
            </span>
          )}
        </button>

        {/* Dropdown utilisateur */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              'flex items-center gap-2 ml-1 sm:ml-2 pl-2 sm:pl-2.5 pr-1.5 py-1 rounded-sm',
              'border border-transparent hover:border-[var(--hairline-strong)] hover:bg-[var(--secondary)] transition-all'
            )}>
              <div className="w-7 h-7 rounded-sm border border-[var(--color-vermillion)]/40 text-[var(--color-vermillion)] flex items-center justify-center text-xs font-semibold font-[family-name:var(--font-geist-mono)]">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <span className="text-sm font-medium hidden md:block truncate max-w-32">
                {user?.name || 'Utilisateur'}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground hidden md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-[var(--popover)] border-[var(--hairline-strong)] rounded-sm"
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium font-[family-name:var(--font-newsreader)] italic">{user?.name || 'Utilisateur'}</p>
                <p className="text-xs text-muted-foreground font-[family-name:var(--font-geist-mono)]">{user?.email || ''}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[var(--hairline-strong)]" />
            <DropdownMenuItem className="text-muted-foreground hover:text-foreground hover:bg-[var(--secondary)] focus:bg-[var(--secondary)] cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="text-muted-foreground hover:text-foreground hover:bg-[var(--secondary)] focus:bg-[var(--secondary)] cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[var(--hairline-strong)]" />
            <DropdownMenuItem
              className="text-[var(--color-vermillion)] hover:text-[var(--color-vermillion)] hover:bg-[var(--secondary)] focus:bg-[var(--secondary)] cursor-pointer"
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
