'use client';

/**
 * GenovaLogo — Green "G" logo component for Genova SaaS
 *
 * Renders a stylized green "G" inside a rounded container,
 * consistent with the emerald/green brand identity.
 * Supports multiple sizes and can render with or without
 * the "genova.Ia" text label.
 */

import { cn } from '@/lib/utils';

interface GenovaLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  compact?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: { container: 'h-8 w-8', text: 'text-sm', letter: 'text-sm', subtitle: 'text-[10px]' },
  md: { container: 'h-12 w-12', text: 'text-2xl', letter: 'text-xl', subtitle: 'text-sm' },
  lg: { container: 'h-16 w-16', text: 'text-3xl', letter: 'text-2xl', subtitle: 'text-base' },
  xl: { container: 'h-20 w-20', text: 'text-4xl', letter: 'text-3xl', subtitle: 'text-lg' },
} as const;

export function GenovaLogo({ size = 'md', showText = false, compact = false, className }: GenovaLogoProps) {
  const s = SIZE_MAP[size];

  return (
    <div className={cn('inline-flex items-center gap-2', compact ? 'gap-1.5' : 'gap-3', className)}>
      {/* Green G Logo Mark */}
      <div
        className={cn(
          'inline-flex items-center justify-center rounded-xl flex-shrink-0',
          compact ? '' : 'rounded-2xl agent-glow',
          'bg-primary/10',
          s.container
        )}
      >
        <span
          className={cn(
            'font-bold text-primary leading-none select-none',
            s.letter
          )}
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          aria-label="Genova"
        >
          G
        </span>
      </div>

      {/* Text Label */}
      {showText && (
        <div className="flex flex-col min-w-0">
          <span
            className={cn('font-bold tracking-tight text-foreground leading-none', s.text)}
          >
            genova<span className="text-primary">.Ia</span>
          </span>
          {!compact && (
            <span className={cn('text-muted-foreground mt-0.5', s.subtitle)}>
              Système d&apos;exploitation pour agents IA
            </span>
          )}
          {compact && (
            <span className={cn('text-muted-foreground', s.subtitle)}>
              AI Operating System
            </span>
          )}
        </div>
      )}
    </div>
  );
}
