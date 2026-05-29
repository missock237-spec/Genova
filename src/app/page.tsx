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
import { MediaView } from '@/components/media/media-view';
import { VoiceView } from '@/components/voice/voice-view';
import { SchedulerView } from '@/components/scheduler/scheduler-view';
import { MarketplaceView } from '@/components/marketplace/marketplace-view';
import { AvatarView } from '@/components/avatars/avatar-view';
import { BrowserView } from '@/components/browser/browser-view';
import { MultimodalView } from '@/components/multimodal/multimodal-view';
import { CollaborationView } from '@/components/collaboration/collaboration-view';
import { IntegrationsView } from '@/components/integrations/integrations-view';
import { ThemeProvider } from 'next-themes';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { isAuthenticated, user } = useAuthStore();
  const { currentView } = useAppStore();
  const hydrateRef = useRef(false);
  const validateRef = useRef(false);
  const validatedRef = useRef(false);

  // Hydrate auth from localStorage only once on mount
  useEffect(() => {
    if (!hydrateRef.current) {
      hydrateRef.current = true;
      useAuthStore.getState().hydrate();
    }
  }, []);

  // Validate session once when authenticated
  useEffect(() => {
    if (isAuthenticated && !validateRef.current) {
      validateRef.current = true;
      (async () => {
        const valid = await useAuthStore.getState().validateSession();
        if (valid) {
          useAppStore.getState().fetchApprovalCount();
        }
        validatedRef.current = true;
      })();
    }
  }, [isAuthenticated]);

  // Listen for auth:unauthorized events
  useEffect(() => {
    const handleUnauthorized = () => {
      useAuthStore.getState().logout();
      validateRef.current = false;
      validatedRef.current = false;
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
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
          {currentView === 'settings' && <SettingsView />}
          {currentView === 'approvals' && <SettingsView initialTab="approvals" />}
          {currentView === 'analytics' && <AnalyticsView />}
          {currentView === 'media' && <MediaView />}
          {currentView === 'voice' && <VoiceView />}
          {currentView === 'scheduler' && <SchedulerView />}
          {currentView === 'marketplace' && <MarketplaceView />}
          {currentView === 'collaboration' && <CollaborationView />}
          {currentView === 'avatars' && <AvatarView />}
          {currentView === 'browser' && <BrowserView />}
          {currentView === 'multimodal' && <MultimodalView />}
          {currentView === 'integrations' && <IntegrationsView />}
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
