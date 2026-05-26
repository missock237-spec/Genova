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
import { ThemeProvider } from 'next-themes';

function AppContent() {
  const { isAuthenticated } = useAuthStore();
  const { currentView } = useAppStore();
  const hydrateRef = useRef(false);

  // Hydrate auth from localStorage only once on mount
  useEffect(() => {
    if (!hydrateRef.current) {
      hydrateRef.current = true;
      useAuthStore.getState().hydrate();
    }
  }, []);

  if (!isAuthenticated) {
    return <AuthForm />;
  }

  return (
    <div className="min-h-screen flex bg-background grid-pattern">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader />
        <div className="flex-1 p-4 sm:p-6 overflow-auto">
          {currentView === 'dashboard' && <DashboardView />}
          {currentView === 'agents' && <AgentsView />}
          {currentView === 'automation' && <AutomationView />}
          {currentView === 'guardrails' && <GuardrailsView />}
          {currentView === 'coordination' && <CoordinationView />}
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
