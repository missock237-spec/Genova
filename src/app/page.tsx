'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore, useAppStore, useModernStore } from '@/lib/store';
import { hardReload, diagnoseServiceWorker } from '@/lib/client-cache-reset';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { AgentsView } from '@/components/agents/agents-view';
import { AutomationView } from '@/components/automation/automation-view';
import { GuardrailsView } from '@/components/guardrails/guardrails-view';
import { CoordinationView } from '@/components/coordination/coordination-view';
import { SettingsView } from '@/components/settings/settings-view';
import { AnalyticsView } from '@/components/analytics/analytics-view';
import BillingPage from '@/components/billing/billing-page';
import DevelopersPage from '@/components/developers/developers-page';
import { ThemeProvider } from 'next-themes';
import { Loader2, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorBoundary } from '@/components/error-boundary';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import HardTechLanding from '@/components/landing/hardtech-landing';

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
  const validateSession = useAuthStore((s) => s.validateSession);
  const logout = useAuthStore((s) => s.logout);

  const currentView = useAppStore((s) => s.currentView);
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

  // --- Fix 2 : validateSession avec retry (2 tentatives) ---
  // Après inscription, le cookie Firebase est frais mais verifySessionCookie
  // peut échouer sur un cold start Vercel (JWKS pas encore téléchargées).
  // On retry une fois avant de déclarer la session expirée.
  useEffect(() => {
    if (isAuthenticated && !validatedRef.current && !loadError) {
      validatedRef.current = true;

      const tryValidate = async (attempt: number): Promise<boolean> => {
        try {
          const valid = await validateSession();
          if (valid) return true;
          // Réponse serveur mais user:null — session vraiment invalide
          if (attempt >= 2) return false;
          // Retry après 2s (cold start Vercel)
          console.warn(`[gen3ia] validateSession attempt ${attempt} failed (user:null), retrying...`);
          await new Promise(r => setTimeout(r, 2000));
          return tryValidate(attempt + 1);
        } catch (err) {
          // Erreur réseau/timeout — ne PAS traiter comme session expirée
          const errMsg = err instanceof Error ? err.message : String(err);
          const isTimeout = err instanceof Error && err.name === 'AbortError';
          console.error(`[gen3ia] validateSession attempt ${attempt} network error:`, errMsg);
          if (attempt >= 2) {
            // Dernière tentative : erreur réseau, pas session expirée
            // On ne bloque pas l'utilisateur — on laisse le dashboard se charger
            console.warn('[gen3ia] validateSession network error after 2 attempts, allowing dashboard');
            return true; // Allow dashboard on network errors
          }
          await new Promise(r => setTimeout(r, 2000));
          return tryValidate(attempt + 1);
        }
      };

      tryValidate(1)
        .then((valid) => {
          if (valid) {
            console.log('[gen3ia] validateSession OK — session active');
            fetchApprovalCount().catch((err) => {
              console.warn('[gen3ia] fetchApprovalCount failed:', err);
            });
          } else {
            console.warn('[gen3ia] validateSession : session expirée après retry');
            setLoadError('Session expirée, veuillez vous reconnecter');
          }
        });
    }
  }, [isAuthenticated, loadError, validateSession, fetchApprovalCount]);

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
    void logout();
  }, [logout]);

  useEffect(() => {
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [handleUnauthorized]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
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

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView />;
      case 'agents': return <AgentsView />;
      case 'automation': return <AutomationView />;
      case 'guardrails': return <GuardrailsView />;
      case 'coordination': return <CoordinationView />;
      case 'settings': return <SettingsView />;
      case 'approvals': return <SettingsView initialTab="approvals" />;
      case 'analytics': return <AnalyticsView />;
      case 'billing': return <BillingPage />;
      case 'developers': return <DevelopersPage />;
      // New v2 views: fall back to dashboard if component doesn't exist yet
      case 'voice':
      case 'images':
      case 'integrations':
      case 'notifications':
      case 'scheduler':
      case 'agent-chat':
      default: return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile sidebar Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-[#0B0C0D] border-[#1C1E22]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar mobileOpen={sidebarOpen} onCloseMobile={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar (mobile hidden - Sheet handles mobile) */}
      <div className="hidden lg:block">
        <AppSidebar />
      </div>

      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader onMenuClick={() => setSidebarOpen(true)} />
        <div className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto">
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
