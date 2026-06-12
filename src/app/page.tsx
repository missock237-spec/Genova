'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore, useAppStore } from '@/lib/store';
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
import { GenovaLogo } from '@/components/ui/genova-logo';

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const { currentView } = useAppStore();
  const hydrateRef = useRef(false);
  const validatedRef = useRef(false);

  // Hydrate auth from localStorage only once on mount
  useEffect(() => {
    if (!hydrateRef.current) {
      hydrateRef.current = true;
      useAuthStore.getState().hydrate();

      // Immediately validate the session with the server
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
      if (e.key === 'genova_user' && !e.newValue) {
        useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // If not authenticated and not loading, redirect to login page
  useEffect(() => {
    if (!isLoading && !isAuthenticated && validatedRef.current) {
      window.location.href = '/login';
    }
  }, [isLoading, isAuthenticated]);

  // Show loading spinner while validating session or redirecting
  if (isLoading || !isAuthenticated || !validatedRef.current) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg grid-pattern">
        <div className="flex flex-col items-center gap-4">
          <GenovaLogo size="md" showText={true} />
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  // Check if email not verified — redirect to login with error
  useEffect(() => {
    if (isAuthenticated && user && user.isEmailVerified === false) {
      window.location.href = '/login?error=email_not_verified';
    }
  }, [isAuthenticated, user]);

  if (isAuthenticated && user && user.isEmailVerified === false) {
    return null;
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
