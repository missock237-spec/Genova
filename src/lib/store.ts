import { create } from 'zustand';
import { apiFetch, ApiError } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  plan: string;
  avatar?: string | null;
  role: string;
  emailVerified: boolean;
  isEmailVerified?: boolean;
  isActive?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
  hydrate: () => void;
  validateSession: () => Promise<boolean>;
  refreshSession: () => Promise<boolean>;
}

interface AppState {
  currentView: 'dashboard' | 'agents' | 'automation' | 'guardrails' | 'coordination' | 'settings' | 'approvals' | 'analytics' | 'integrations' | 'connectors';
  setCurrentView: (view: AppState['currentView']) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  pendingApprovalCount: number;
  setPendingApprovalCount: (count: number) => void;
  fetchApprovalCount: () => Promise<void>;
}

const STORAGE_KEY = 'agentos_user';

function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    // Validate essential fields exist
    if (!parsed.id || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearAuthStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently fail
  }
}

function persistUser(user: User): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Silently fail
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: (user: User) => {
    persistUser(user);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    // Call server logout to invalidate session + clear cookies
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Even if server logout fails, we must clear client state
      // The session will expire naturally on the server side
    }
    clearAuthStorage();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  hydrate: () => {
    const stored = getStoredUser();
    if (stored) {
      set({ user: stored, isAuthenticated: true, isLoading: true });
    } else {
      set({ isLoading: true });
    }
  },

  refreshSession: async (): Promise<boolean> => {
    try {
      await apiFetch('/api/auth/refresh', { method: 'POST' });
      // If refresh succeeded, validate the new session
      return get().validateSession();
    } catch {
      clearAuthStorage();
      set({ user: null, isAuthenticated: false, isLoading: false });
      return false;
    }
  },

  validateSession: async (): Promise<boolean> => {
    try {
      const data = await apiFetch<User>('/api/auth/me');
      if (data && data.id) {
        persistUser(data);
        set({ user: data, isAuthenticated: true, isLoading: false });
        return true;
      }
      clearAuthStorage();
      set({ user: null, isAuthenticated: false, isLoading: false });
      return false;
    } catch (error: unknown) {
      // If we get a 401, try refreshing the session before giving up
      const isUnauthorized =
        error instanceof ApiError && error.status === 401;

      if (isUnauthorized) {
        // Try to refresh the session using the refresh token
        const refreshed = await get().refreshSession();
        if (refreshed) return true;

        clearAuthStorage();
        set({ user: null, isAuthenticated: false, isLoading: false });
        return false;
      }

      // On network errors, keep the current state (don't log out)
      // The user might just have a temporary network issue
      set({ isLoading: false });
      return false;
    }
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
