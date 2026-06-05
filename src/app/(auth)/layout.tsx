/**
 * GENOVA AI OS — Auth Layout
 * Provides the dark background for all auth pages.
 * Session checking is handled client-side in each form component.
 */

import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950">
      {children}
    </div>
  );
}
