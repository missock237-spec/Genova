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
import { SettingsView } from '@/components/settings/settings-view';
import { AnalyticsView } from '@/components/analytics/analytics-view';
import IntegrationsView from '@/components/integrations/integrations-view';
import ConnectorsView from '@/components/connectors/connectors-view';
import { ThemeProvider } from 'next-themes';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { currentView } = useAppStore();
  const hydrateRef = useRef(false);
  const validatedRef = useRef(false);

  // Hydrate auth from localStorage only once on mount
  useEffect(() => {
    if (!hydrateRef.current) {
      hydrateRef.current = true;
      useAuthStore.getState().hydrate();

      // Immediately validate the session with the server
      // This checks if the httpOnly cookie session is still valid
      (async () => {
        const valid = await useAuthStore.getState().validateSession();
        if (valid) {
          useAppStore.getState().fetchApprovalCount();
        }
        validatedRef.current = true;
      })();
    }
  }, []);

  // Listen for storage events (cross-tab logout)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'agentos_user' && !e.newValue) {
        // Another tab logged out — sync this tab
        useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Show loading spinner while validating session
  if (isLoading && !validatedRef.current) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg grid-pattern">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

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
          {currentView === 'settings' && <SettingsView />}
          {currentView === 'approvals' && <SettingsView initialTab="approvals" />}
          {currentView === 'analytics' && <AnalyticsView />}
          {currentView === 'integrations' && <IntegrationsView />}
          {currentView === 'connectors' && <ConnectorsView />}
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
