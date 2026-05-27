import { create } from 'zustand';

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
  /**
   * Re-validate the current session with the server.
   * Called on app startup to check if the httpOnly cookie is still valid.
   */
  validateSession: () => Promise<boolean>;
}

interface AppState {
  currentView: 'dashboard' | 'agents' | 'automation' | 'guardrails' | 'coordination' | 'knowledge' | 'settings';
  setCurrentView: (view: AppState['currentView']) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentConversationId: string | null;
  setCurrentConversationId: (id: string | null) => void;
}

function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('genova_user');
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
      localStorage.setItem('genova_user', JSON.stringify(user));
    }
    set({ user, isAuthenticated: true });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('genova_user');
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
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const user = await res.json();
        if (typeof window !== 'undefined') {
          localStorage.setItem('genova_user', JSON.stringify(user));
        }
        set({ user, isAuthenticated: true });
        return true;
      } else {
        // Session expired or invalid — clear local state
        if (typeof window !== 'undefined') {
          localStorage.removeItem('genova_user');
        }
        set({ user: null, isAuthenticated: false });
        return false;
      }
    } catch {
      return false;
    }
  },
}));

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  setCurrentView: (currentView) => set({ currentView }),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  currentConversationId: null,
  setCurrentConversationId: (currentConversationId) => set({ currentConversationId }),
}));
