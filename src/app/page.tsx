'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore, useAppStore } from '@/lib/store';
import { AuthForm } from '@/components/auth/auth-form';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { AgentsView } from '@/components/agents/agents-view';
import { AutomationView } from '@/components/automation/automation-view';
import { GuardrailsView } from '@/components/guardrails/guardrails-view';
import { CoordinationView } from '@/components/coordination/coordination-view';
import { KnowledgeView } from '@/components/knowledge/knowledge-view';
import { ThemeProvider } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';

const viewComponents = {
  dashboard: DashboardView,
  agents: AgentsView,
  automation: AutomationView,
  knowledge: KnowledgeView,
  guardrails: GuardrailsView,
  coordination: CoordinationView,
};

function AppContent() {
  const { isAuthenticated } = useAuthStore();
  const { currentView } = useAppStore();
  const hydrateRef = useRef(false);

  useEffect(() => {
    if (!hydrateRef.current) {
      hydrateRef.current = true;
      useAuthStore.getState().hydrate();
    }
  }, []);

  if (!isAuthenticated) {
    return <AuthForm />;
  }

  const ViewComponent = viewComponents[currentView];

  return (
    <div className="min-h-screen flex bg-background grid-pattern">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader />
        <div className="flex-1 p-4 sm:p-6 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <ViewComponent />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AppContent />
    </ThemeProvider>
  );
}
