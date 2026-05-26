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
}

interface AppState {
  currentView: 'dashboard' | 'agents' | 'automation' | 'guardrails' | 'coordination' | 'knowledge';
  setCurrentView: (view: AppState['currentView']) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentConversationId: string | null;
  setCurrentConversationId: (id: string | null) => void;
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
}));

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  setCurrentView: (currentView) => set({ currentView }),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  currentConversationId: null,
  setCurrentConversationId: (currentConversationId) => set({ currentConversationId }),
}));
