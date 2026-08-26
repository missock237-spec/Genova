'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAuthStore, useAppStore, useModernStore } from '@/lib/store';
import { hardReload, diagnoseServiceWorker } from '@/lib/client-cache-reset';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { AdBar } from '@/components/advertising/ad-bar';
import { ThemeProvider } from 'next-themes';
import { Loader2, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorBoundary } from '@/components/error-boundary';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SystemCommandCenter } from '@/components/system/system-command-center';
import { CommandPalette } from '@/components/system/command-palette';

// [bundle-01] Tous les composants de vue sont chargés dynamiquement.
// Seule la vue active est téléchargée — réduction ~200-400KB du JS initial.
const ViewSkeleton = () => (
  <div className="flex items-center justify-center h-64">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const DashboardView = dynamic(
  () => import('@/components/dashboard/dashboard-view').then(m => ({ default: m.DashboardView })),
  { loading: ViewSkeleton, ssr: false },
);
const AgentsView = dynamic(
  () => import('@/components/agents/agents-view').then(m => ({ default: m.AgentsView })),
  { loading: ViewSkeleton, ssr: false },
);
const AutomationView = dynamic(
  () => import('@/components/automation/automation-view').then(m => ({ default: m.AutomationView })),
  { loading: ViewSkeleton, ssr: false },
);
const GuardrailsView = dynamic(
  () => import('@/components/guardrails/guardrails-view').then(m => ({ default: m.GuardrailsView })),
  { loading: ViewSkeleton, ssr: false },
);
const CoordinationView = dynamic(
  () => import('@/components/coordination/coordination-view').then(m => ({ default: m.CoordinationView })),
  { loading: ViewSkeleton, ssr: false },
);
const SettingsView = dynamic(
  () => import('@/components/settings/settings-view').then(m => ({ default: m.SettingsView })),
  { loading: ViewSkeleton, ssr: false },
);
const AnalyticsView = dynamic(
  () => import('@/components/analytics/analytics-view').then(m => ({ default: m.AnalyticsView })),
  { loading: ViewSkeleton, ssr: false },
);
const BillingPage = dynamic(
  () => import('@/components/billing/billing-page'),
  { loading: ViewSkeleton, ssr: false },
);
const DevelopersPage = dynamic(
  () => import('@/components/developers/developers-page'),
  { loading: ViewSkeleton, ssr: false },
);
const IntegrationsView = dynamic(
  () => import('@/components/integrations/integrations-view').then(m => ({ default: m.IntegrationsView })),
  { loading: ViewSkeleton, ssr: false },
);
const SchedulerView = dynamic(
  () => import('@/components/scheduler/scheduler-view').then(m => ({ default: m.SchedulerView })),
  { loading: ViewSkeleton, ssr: false },
);
const VoiceView = dynamic(
  () => import('@/components/voice/voice-view').then(m => ({ default: m.VoiceView })),
  { loading: ViewSkeleton, ssr: false },
);
const MediaView = dynamic(
  () => import('@/components/media/media-view').then(m => ({ default: m.MediaView })),
  { loading: ViewSkeleton, ssr: false },
);
const PromptsView = dynamic(
  () => import('@/components/prompts/prompts-view').then(m => ({ default: m.PromptsView })),
  { loading: ViewSkeleton, ssr: false },
);
const GenerationWorkbench = dynamic(
  () => import('@/components/generation/generation-workbench').then(m => ({ default: m.GenerationWorkbench })),
  { loading: ViewSkeleton, ssr: false },
);
// [bundle-02] Landing page uniquement pour les non-authentifiés — ne pas charger pour les users connectés
const HardTechLanding = dynamic(
  () => import('@/components/landing/hardtech-landing'),
  { ssr: false },
);

// T23 : délai avant d'afficher l'UI "chargement bloqué" (12s).
const STUCK_LOADING_TIMEOUT_MS = 12_000;

const pageTransition = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12 },
  transition: { duration: 0.2, ease: 'easeInOut' as const },
};

function AppContent() {
  // Sélecteurs zustand INDIVIDUELS (retournent des références stables)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const hydrate = useAuthStore((s) => s.hydrate);
  const logout = useAuthStore((s) => s.logout);

  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const fetchApprovalCount = useAppStore((s) => s.fetchApprovalCount);

  const hydratedRef = useRef(false);
  const validatedRef = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // T23 : détection du chargement bloqué
  const [isStuck, setIsStuck] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [swInfo, setSwInfo] = useState<string | null>(null);

  // --- Fix 2 : logs debug pour hydrate() ---
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      hydrate()
        .then(() => {
          console.log('[gen3ia] hydrate OK');
        })
        .catch((err: Error) => {
          console.error('[gen3ia] hydrate error:', err);
          setLoadError(err?.message || 'Erreur de chargement');
        });
    }
  }, [hydrate]);

  // --- Session validée : hydrate() a déjà vérifié la session via /api/auth/me ---
  useEffect(() => {
    if (isAuthenticated && !validatedRef.current && !loadError) {
      validatedRef.current = true;
      console.log('[gen3ia] session validée via hydrate — chargement des données');
      fetchApprovalCount().catch((err) => {
        console.warn('[gen3ia] fetchApprovalCount failed:', err);
      });
    }
  }, [isAuthenticated, loadError, fetchApprovalCount]);

  // --- SPA deep-linking : lire le pathname pour restaurer la vue ---
  const authDoneRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (authDoneRef.current) return;
    authDoneRef.current = true;
    const path = window.location.pathname.replace(/^\//, '');
    const validViews: Record<string, string> = {
      dashboard: 'dashboard', agents: 'agents', 'agent-chat': 'agent-chat',
      automation: 'automation', guardrails: 'guardrails', coordination: 'coordination',
      settings: 'settings', approvals: 'approvals', analytics: 'analytics',
      billing: 'billing', developers: 'developers', voice: 'voice',
      images: 'images', integrations: 'integrations', notifications: 'notifications',
      scheduler: 'scheduler', prompts: 'prompts', generation: 'generation',
    };
    if (path && validViews[path]) {
      setCurrentView(validViews[path] as any);
    }
  }, [isAuthenticated, setCurrentView]);

  // --- SPA navigation : mettre à jour l'URL quand currentView change ---
  useEffect(() => {
    if (!isAuthenticated) return;
    const expected = currentView === 'dashboard' ? '/' : `/${currentView}`;
    if (window.location.pathname !== expected) {
      window.history.replaceState(null, '', expected);
    }
  }, [isAuthenticated, currentView]);

  // --- SPA popstate : boutons retour/avancer du navigateur ---
  useEffect(() => {
    if (!isAuthenticated) return;
    const validViews: Record<string, string> = {
      dashboard: 'dashboard', agents: 'agents', 'agent-chat': 'agent-chat',
      automation: 'automation', guardrails: 'guardrails', coordination: 'coordination',
      settings: 'settings', approvals: 'approvals', analytics: 'analytics',
      billing: 'billing', developers: 'developers', voice: 'voice',
      images: 'images', integrations: 'integrations', notifications: 'notifications',
      scheduler: 'scheduler', prompts: 'prompts', generation: 'generation',
    };
    const onPopState = () => {
      const path = window.location.pathname.replace(/^\//, '');
      if (path && validViews[path]) {
        setCurrentView(validViews[path] as any);
      } else {
        setCurrentView('dashboard');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isAuthenticated, setCurrentView]);

  // --- T23 : timer stuck loading ---
  useEffect(() => {
    if (!isLoading) {
      setIsStuck(false);
      return;
    }
    const timer = setTimeout(() => {
      setIsStuck(true);
      diagnoseServiceWorker().then((info) => {
        if (info.hasSW) {
          setSwInfo(`${info.scriptURL} (scope: ${info.scope})`);
        } else {
          setSwInfo('Aucun SW actif');
        }
      });
    }, STUCK_LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // --- T23 : handler hard reload ---
  const handleHardReload = useCallback(async () => {
    setResetting(true);
    console.log('[gen3ia] Hard reload requested by user');
    try {
      await hardReload({ bypassCache: true, includeStorage: false });
    } catch (err) {
      console.error('[gen3ia] Hard reload failed:', err);
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }
  }, []);

  // --- Fix 4 : logout stable ---
  const handleUnauthorized = useCallback(() => {
    validatedRef.current = false;
    authDoneRef.current = false;
    void logout();
  }, [logout]);

  useEffect(() => {
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [handleUnauthorized]);

  if (loadError) {
    const isSessionError = loadError.includes('Session expirée') || loadError.includes('reconnect');
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 gap-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <div className="flex flex-col sm:flex-row gap-3">
          {isSessionError && (
            <button
              onClick={() => { window.location.href = '/login'; }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Se reconnecter
            </button>
          )}
          <button
            onClick={() => {
              setLoadError(null);
              validatedRef.current = false;
              hydratedRef.current = false;
              void hydrate();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Reessayer
          </button>
        </div>
      </div>
    );
  }

  // Landing publique Hard-Tech Realism pour les visiteurs non authentifiés
  if (!isAuthenticated && !isLoading) {
    return <HardTechLanding />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {isStuck
              ? 'Le chargement prend plus de temps que prévu…'
              : 'Chargement de Gen3ia...'}
          </p>
        </div>

        {isStuck && (
          <div className="max-w-md w-full rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Chargement bloqué
                </p>
                <p className="text-xs text-muted-foreground">
                  Un Service Worker obsolète ou un cache périmé peut empêcher
                  l&apos;application de démarrer. Vider le cache et recharger
                  la page devrait résoudre le problème.
                </p>
                {swInfo && (
                  <p className="text-[10px] text-muted-foreground/70 font-mono break-all">
                    SW actif : {swInfo}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleHardReload}
                disabled={resetting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {resetting ? 'Réinitialisation…' : 'Vider le cache et recharger'}
              </button>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.reload();
                  }
                }}
                disabled={resetting}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Recharger simplement
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Vues où la barre pub est masquée (le chat a ConversationAd intégré)
  const hideAdBar = currentView === 'agent-chat';

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return (
        <div className="space-y-4">
          <SystemCommandCenter />
          <DashboardView />
        </div>
      );
      case 'agents': return <AgentsView />;
      case 'automation': return <AutomationView />;
      case 'guardrails': return <GuardrailsView />;
      case 'coordination': return <CoordinationView />;
      case 'settings': return <SettingsView />;
      case 'approvals': return <SettingsView initialTab="approvals" />;
      case 'analytics': return <AnalyticsView />;
      case 'billing': return <BillingPage />;
      case 'developers': return <DevelopersPage />;
      case 'voice': return <VoiceView />;
      case 'images': return <MediaView />;
      case 'generation': return <GenerationWorkbench />;
      case 'integrations': return <IntegrationsView />;
      case 'notifications': return <DashboardView />;
      case 'scheduler': return <SchedulerView />;
      case 'prompts': return <PromptsView />;
      case 'agent-chat': return <AgentsView />;
      default: return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-[#0B0C0D] border-[#1C1E22]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar mobileOpen={sidebarOpen} onCloseMobile={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="hidden lg:block">
        <AppSidebar />
      </div>

      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader onMenuClick={() => setSidebarOpen(true)} />
        <div className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto pb-12">
          <ErrorBoundary>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                initial={pageTransition.initial}
                animate={pageTransition.animate}
                exit={pageTransition.exit}
                transition={pageTransition.transition}
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </div>
      </main>

      <AdBar sessionId="main-session" hidden={hideAdBar} />
    </div>
  );
}

export default function Home() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AppContent />
      {/* Global Cmd+K palette — always mounted, hidden until shortcut */}
      <CommandPaletteGlobalBridge />
    </ThemeProvider>
  );
}

/**
 * Bridge that wires the global CommandPalette to the Zustand store.
 * Mounted once at the app root so the shortcut works in any view.
 */
function CommandPaletteGlobalBridge() {
  // We read useAppStore lazily to avoid SSR/hydration timing issues.
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  return <CommandPalette onNavigate={(v) => setCurrentView(v as any)} />;
}
