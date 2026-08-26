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
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'agents', label: 'Agents IA', icon: Bot },
        { id: 'prompts', label: 'Prompts', icon: Type },
        { id: 'automation', label: 'Automation', icon: Radio },
      ],
    },
    {
      items: [
        { id: 'coordination', label: 'Workflows', icon: GitBranch },
        { id: 'guardrails', label: 'Guardrails', icon: Shield },
        { id: 'analytics', label: 'Analytiques', icon: BarChart3 },
      ],
    },
    {
      items: [
        { id: 'voice', label: 'Voice Studio', icon: Mic },
        { id: 'generation', label: 'Génération IA', icon: Wand2 },
        { id: 'images', label: 'Generate Image', icon: ImageIcon },
        { id: 'integrations', label: 'Integrations', icon: Puzzle },
        { id: 'scheduler', label: 'Scheduler', icon: Clock },
      ],
    },
    {
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
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-[#1C1E22]">
        <motion.div
          className="flex items-center gap-2.5"
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <motion.div
            whileHover={{ rotate: 12 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <Image
              src="/logo.png"
              alt="Gen3ia"
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg"
              priority
            />
          </motion.div>
          {(!collapsed || isMobile) && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="font-bold text-lg tracking-tight"
            >
              Gen3ia
            </motion.span>
          )}
        </motion.div>

        {/* Collapse button - desktop only */}
        {!isMobile && (
          <motion.button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center p-1.5 rounded-lg hover:bg-[rgba(0,245,255,0.08)] text-[#8A9099] hover:text-[#00F5FF] transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <ChevronLeft size={16} />
            </motion.div>
          </motion.button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2.5 space-y-5 overflow-y-auto custom-scrollbar">
        {menuSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-0.5">
            {(!collapsed || isMobile) && section.label && (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8A9099]/60">
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
                  whileHover={{ x: 4 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className={cn(
                    'relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group',
                    isActive
                      ? 'text-[#00F5FF] font-medium'
                      : 'text-[#8A9099] hover:text-[#E6E8EC]'
                  )}
                  title={!showLabel ? item.label : undefined}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#00F5FF]"
                      style={{ boxShadow: '0 0 12px rgba(0, 245, 255, 0.4)' }}
                      transition={{
                        type: 'spring',
                        stiffness: 350,
                        damping: 30,
                      }}
                    />
                  )}

                  {/* Active background */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-bg"
                      className="absolute inset-0 rounded-lg"
                      style={{ background: 'rgba(0, 245, 255, 0.1)' }}
                      transition={{
                        type: 'spring',
                        stiffness: 350,
                        damping: 30,
                      }}
                    />
                  )}

                  <item.icon className={cn(
                    'h-4 w-4 shrink-0 relative z-10',
                    isActive ? 'text-[#00F5FF]' : 'text-[#8A9099] group-hover:text-[#E6E8EC]'
                  )} />
                  {showLabel && (
                    <span className="flex-1 text-left truncate relative z-10">
                      {item.label}
                    </span>
                  )}
                  {showLabel && item.badge && item.badge > 0 && (
                    <span className="relative z-10 min-w-[20px] h-5 flex items-center justify-center bg-[#00F5FF] text-[#001416] text-[10px] font-semibold rounded-full px-1.5">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                  {!showLabel && item.badge && item.badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#00F5FF] rounded-full" />
                  )}
                </motion.button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User section at bottom */}
      <div className="p-3 border-t border-[#1C1E22]">
        {(!collapsed || isMobile) && user && (
          <div className="mb-2 px-3 text-xs text-[#8A9099] truncate font-mono">
            {user.email}
          </div>
        )}
        <motion.button
          onClick={() => { void logout(); onCloseMobile?.(); }}
          whileHover={{ x: 4 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#8A9099] hover:text-[#FF5C5C] hover:bg-[rgba(255,92,92,0.08)] transition-colors"
          title="Déconnexion"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {(!collapsed || isMobile) && <span>Déconnexion</span>}
        </motion.button>
      </div>
    </div>
  );

  // Mobile: render navContent directly (parent wraps in Sheet)
  if (isMobile) {
    return <>{navContent}</>;
  }

  // Desktop: animated collapsible sidebar
  return (
    <motion.aside
      className="hidden lg:flex flex-col border-r border-[#1C1E22] bg-[#0B0C0D] shrink-0 overflow-hidden"
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
