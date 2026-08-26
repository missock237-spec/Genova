'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAppStore, useAuthStore, useModernStore } from '@/lib/store';
import {
  LayoutDashboard, Bot, Radio, Shield, GitBranch, Settings,
  BarChart3, ChevronLeft, LogOut, Sparkles, Type,
  Wallet, Mic, ImageIcon, Puzzle, Clock, Bell, Code2, Wand2,
} from 'lucide-react';
import type { ModernViewType } from '@/lib/store';

interface AppSidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  id: ModernViewType;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * Sidebar — Editorial Instrument
 * Plus de glow néon. Hairlines 1px, marqueurs carrés, Newsreader italic pour la marque.
 */
export function AppSidebar({ mobileOpen = false, onCloseMobile }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { currentView, setCurrentView, approvalCount } = useAppStore();
  const { user, logout } = useAuthStore();
  const { unreadCount } = useModernStore();

  const handleNav = (id: ModernViewType) => {
    setCurrentView(id as any);
    onCloseMobile?.();
  };

  const menuSections: NavSection[] = [
    {
      label: 'Pilotage',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'agents', label: 'Agents IA', icon: Bot },
        { id: 'prompts', label: 'Prompts', icon: Type },
        { id: 'automation', label: 'Automation', icon: Radio },
      ],
    },
    {
      label: 'Contrôle',
      items: [
        { id: 'coordination', label: 'Workflows', icon: GitBranch },
        { id: 'guardrails', label: 'Guardrails', icon: Shield },
        { id: 'analytics', label: 'Analytiques', icon: BarChart3 },
      ],
    },
    {
      label: 'Production',
      items: [
        { id: 'voice', label: 'Voice Studio', icon: Mic },
        { id: 'generation', label: 'Génération IA', icon: Wand2 },
        { id: 'images', label: 'Generate Image', icon: ImageIcon },
        { id: 'integrations', label: 'Integrations', icon: Puzzle },
        { id: 'scheduler', label: 'Scheduler', icon: Clock },
      ],
    },
    {
      label: 'Système',
      items: [
        { id: 'billing', label: 'Facturation', icon: Wallet },
        { id: 'developers', label: 'Developers', icon: Code2 },
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount || undefined },
        { id: 'settings', label: 'Paramètres', icon: Settings },
        { id: 'approvals', label: 'Approbations', icon: Sparkles, badge: approvalCount || undefined },
      ],
    },
  ];

  const isMobile = !!onCloseMobile;
  const navContent = (
    <div className="flex flex-col h-full bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
      {/* Marque — serif éditorial */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--sidebar-border)]">
        <motion.div
          className="flex items-center gap-2.5"
          whileHover={{ scale: 1.01 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <Image
            src="/logo.png"
            alt="Gen3ia"
            width={28}
            height={28}
            className="h-7 w-7 rounded-sm"
            priority
          />
          {(!collapsed || isMobile) && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="font-[family-name:var(--font-newsreader)] text-lg italic font-medium tracking-tight"
            >
              Gen3ia
            </motion.span>
          )}
          {(!collapsed || isMobile) && (
            <span className="hardtech-data text-[0.58rem] text-muted-foreground ml-1 hidden sm:inline">REV.2.4</span>
          )}
        </motion.div>

        {/* Bouton collapse desktop */}
        {!isMobile && (
          <motion.button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center p-1.5 rounded-sm hover:bg-[var(--sidebar-accent)] text-muted-foreground hover:text-[var(--color-vermillion)] transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <ChevronLeft size={15} />
            </motion.div>
          </motion.button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-4 space-y-5 overflow-y-auto custom-scrollbar">
        {menuSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-px">
            {(!collapsed || isMobile) && section.label && (
              <p className="px-3 pb-2 hardtech-data text-[0.58rem] uppercase tracking-[0.18em] text-muted-foreground">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const isActive = currentView === item.id;
              const showLabel = !collapsed || isMobile;
              return (
                <motion.button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  whileHover={{ x: 2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className={cn(
                    'relative w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors group',
                    isActive
                      ? 'text-[var(--color-vermillion)] font-medium bg-[var(--sidebar-accent)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[var(--sidebar-accent)]'
                  )}
                  title={!showLabel ? item.label : undefined}
                >
                  {/* Marqueur actif : barre verticale hairline 2px */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-indicator"
                      className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--color-vermillion)]"
                      transition={{
                        type: 'spring',
                        stiffness: 350,
                        damping: 30,
                      }}
                    />
                  )}

                  <item.icon className={cn(
                    'h-4 w-4 shrink-0 relative z-10',
                    isActive ? 'text-[var(--color-vermillion)]' : 'text-muted-foreground group-hover:text-foreground'
                  )} />
                  {showLabel && (
                    <span className="flex-1 text-left truncate relative z-10">
                      {item.label}
                    </span>
                  )}
                  {showLabel && item.badge && item.badge > 0 && (
                    <span className="relative z-10 min-w-[18px] h-[18px] flex items-center justify-center bg-[var(--color-vermillion)] text-[var(--color-bone)] text-[0.62rem] font-semibold font-[family-name:var(--font-geist-mono)] rounded-sm px-1.5 uppercase tracking-wider">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                  {!showLabel && item.badge && item.badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[var(--color-vermillion)] rounded-sm" />
                  )}
                </motion.button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Section utilisateur */}
      <div className="p-3 border-t border-[var(--sidebar-border)]">
        {(!collapsed || isMobile) && user && (
          <div className="mb-2 px-3 hardtech-data text-[0.62rem] text-muted-foreground truncate">
            {user.email}
          </div>
        )}
        <motion.button
          onClick={() => { void logout(); onCloseMobile?.(); }}
          whileHover={{ x: 2 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm text-muted-foreground hover:text-[var(--color-vermillion)] hover:bg-[var(--sidebar-accent)] transition-colors"
          title="Déconnexion"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {(!collapsed || isMobile) && <span className="hardtech-data text-[0.72rem] uppercase tracking-wider">Déconnexion</span>}
        </motion.button>
      </div>
    </div>
  );

  // Mobile: navContent direct (le parent wrap dans Sheet)
  if (isMobile) {
    return <>{navContent}</>;
  }

  // Desktop: aside animé
  return (
    <motion.aside
      className="hidden lg:flex flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] shrink-0 overflow-hidden"
      animate={{ width: collapsed ? 64 : 256 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
    >
      {navContent}
    </motion.aside>
  );
}
