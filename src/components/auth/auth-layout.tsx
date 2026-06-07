/**
 * GENOVA AI OS — Auth Layout
 * Shared layout component for all auth pages.
 * Animated background + Features panel + glassmorphism card.
 */

'use client';

import { type ReactNode } from 'react';
import { AnimatedBackground, FeaturesPanel } from './shared';
import { GenovaLogo } from '@/components/ui/genova-logo';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <AnimatedBackground />

      {/* Left: Features */}
      <div className="relative hidden lg:block lg:w-1/2 xl:w-3/5 border-r border-slate-800/50">
        <FeaturesPanel />
      </div>

      {/* Right: Auth Form */}
      <div className="relative w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl shadow-black/50 relative overflow-hidden">
            {/* Accent line */}
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent rounded-full" />

            {/* Logo + Brand */}
            <div className="mb-8 space-y-1">
              <div className="flex items-center gap-3 mb-4">
                <GenovaLogo size="sm" showText={true} compact={true} />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
              {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
            </div>

            {/* Form area */}
            <div>{children}</div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-slate-800/50 text-center">
              <p className="text-xs text-slate-600">
                © {new Date().getFullYear()} Genova AI. Tous droits réservés.{' '}
                <span className="text-slate-700">•</span>{' '}
                <a href="/privacy" className="hover:text-slate-400 transition-colors">Confidentialité</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
