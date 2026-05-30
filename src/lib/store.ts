import { create } from 'zustand';
import { apiFetch } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  plan: string;
  avatar?: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
  hydrate: () => void;
  validateSession: () => Promise<boolean>;
}

interface AppState {
  currentView: 'dashboard' | 'agents' | 'automation' | 'guardrails' | 'coordination' | 'settings' | 'approvals' | 'analytics' | 'integrations';
  setCurrentView: (view: AppState['currentView']) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  pendingApprovalCount: number;
  setPendingApprovalCount: (count: number) => void;
  fetchApprovalCount: () => Promise<void>;
}

function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('agentos_user');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentos_user', JSON.stringify(user));
    }
    set({ user, isAuthenticated: true });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('agentos_user');
    }
    set({ user: null, isAuthenticated: false });
  },
  hydrate: () => {
    const stored = getStoredUser();
    if (stored) {
      set({ user: stored, isAuthenticated: true });
    }
  },
  validateSession: async () => {
    try {
      const data = await apiFetch<User>('/api/auth/me');
      if (data && data.id) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('agentos_user', JSON.stringify(data));
        }
        set({ user: data, isAuthenticated: true });
        return true;
      }
    } catch (error: unknown) {
      // Only clear auth state on 401 (unauthorized), not on network failures
      const isUnauthorized =
        typeof error === 'object' && error !== null &&
        'status' in error && (error as { status: number }).status === 401;
      if (isUnauthorized) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('agentos_user');
        }
        set({ user: null, isAuthenticated: false });
      }
    }
    return false;
  },
}));

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  setCurrentView: (currentView) => set({ currentView }),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  pendingApprovalCount: 0,
  setPendingApprovalCount: (pendingApprovalCount) => set({ pendingApprovalCount }),
  fetchApprovalCount: async () => {
    try {
      const approvals = await apiFetch<Array<{ status: string }>>('/api/approvals?status=pending');
      set({ pendingApprovalCount: approvals.length });
    } catch {
      // Silently fail
    }
  },
}));
