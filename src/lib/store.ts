import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  name: string;
  plan: string;
  role: string;
}

// ============================================================
// Fix T23 — Timeout sur fetch /api/auth/me
// ============================================================
//  Avant : si le fetch ne répondait jamais (SW bloqué, réseau
//  instable, cold start Vercel > 30s), `isLoading` restait `true`
//  indéfiniment → spinner "Chargement de Gen3ia..." bloqué.
//
//  Maintenant : un AbortController tue le fetch après 10s et
//  déclenche le path "non authentifié" (isLoading=false).
// ============================================================
const HYDRATE_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
  url: string,
  opts: { credentials?: RequestCredentials } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HYDRATE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  hydrate: () => Promise<void>;
  validateSession: () => Promise<boolean>;
  /** Resets local state AND calls POST /api/auth/logout server-side. */
  logout: () => Promise<void>;
  /** Legacy alias for hydrate — fetch session and populate user. */
  login: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  // Sécurité: jamais authentifié par défaut. isLoading=true jusqu'à hydrate()
  // pour que l'UI affiche un loader plutôt que le dashboard pendant la vérif.
  isAuthenticated: false,
  isLoading: true,
  user: null,
  hydrate: async () => {
    try {
      // T23 : timeout 10s via AbortController. Si le fetch pend (SW bloqué,
      // réseau mort, etc.), on sort en isLoading=false plutôt que de rester
      // bloqué sur le spinner indéfiniment.
      const res = await fetchWithTimeout('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          set({
            isAuthenticated: true,
            isLoading: false,
            user: {
              id: data.user.id,
              email: data.user.email,
              name: data.user.name,
              plan: data.user.plan || 'free',
              role: data.user.role || 'user',
            },
          });
          return;
        }
      }
      // Pas de session ou réponse non-OK → utilisateur non authentifié
      set({ isAuthenticated: false, isLoading: false, user: null });
    } catch (e) {
      // T23 : AbortError (timeout) OU erreur réseau → non authentifié
      // (pas de fuite du dashboard), mais on logge pour le debug.
      const err = e as Error;
      const reason = err?.name === 'AbortError' ? 'timeout' : 'network';
      console.error(`[auth/store] hydrate failed (${reason}):`, err?.message || err);
      set({ isAuthenticated: false, isLoading: false, user: null });
    }
  },
  validateSession: async () => {
    try {
      const res = await fetchWithTimeout('/api/auth/me', { credentials: 'include' });
      return res.ok && !!(await res.json()).user;
    } catch { return false; }
  },
  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    set({ isAuthenticated: false, isLoading: false, user: null });
  },
  login: async () => {
    // Legacy alias — delegates to hydrate
    await useAuthStore.getState().hydrate();
  },
}));

export type ViewType =
  | 'dashboard'
  | 'agents'
  | 'automation'
  | 'guardrails'
  | 'coordination'
  | 'settings'
  | 'approvals'
  | 'analytics'
  | 'billing'
  | 'developers'
  | 'voice'
  | 'images'
  | 'integrations'
  | 'notifications'
  | 'scheduler'
  | 'agent-chat'
  | 'prompts'
  | 'generation';

interface AppState {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  approvalCount: number;
  fetchApprovalCount: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),
  approvalCount: 0,
  fetchApprovalCount: async () => {
    try {
      const res = await fetch('/api/approvals?status=pending');
      if (res.ok) {
        const data = await res.json();
        set({ approvalCount: data?.count || 0 });
      }
    } catch {}
  },
}));

// ============================================================
// Modern Dashboard Data Store (v2 architecture)
// ============================================================
export type ModernViewType =
  | 'dashboard' | 'agents' | 'agent-chat' | 'automation' | 'guardrails'
  | 'coordination' | 'settings' | 'approvals' | 'analytics' | 'billing'
  | 'developers' | 'voice' | 'images' | 'integrations' | 'notifications'
  | 'scheduler' | 'prompts' | 'generation';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}

interface DashboardStats {
  agentCount: number;
  activeSessions: number;
  totalTasks: number;
  successRate: number;
  creditsUsed: number;
  creditsRemaining: number;
  recentActivity: { action: string; createdAt: string }[];
}

interface ModernUIState {
  // Extend view types to include new ones
  currentView: ModernViewType;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  // Dashboard data
  dashboardStats: DashboardStats | null;
  setDashboardStats: (stats: DashboardStats | null) => void;
  // Notifications
  notifications: NotificationItem[];
  unreadCount: number;
  setNotifications: (notifs: NotificationItem[]) => void;
  markNotificationRead: (id: string) => void;
}

export const useModernStore = create<ModernUIState>((set) => ({
  currentView: 'dashboard',
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  dashboardStats: null,
  setDashboardStats: (stats) => set({ dashboardStats: stats }),
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifs) => set({ notifications: notifs, unreadCount: notifs.filter(n => !n.read).length }),
  markNotificationRead: (id) => set((s) => ({
    notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n),
    unreadCount: s.notifications.filter(n => !n.read && n.id !== id).length,
  })),
}));
