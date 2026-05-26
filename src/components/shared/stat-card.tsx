'use client';

import { Card, CardContent } from '@/components/ui/card';
import { type LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: string;
  className?: string;
}

export function StatCard({ title, value, icon: Icon, description, trend, className = '' }: StatCardProps) {
  return (
    <Card className={`relative overflow-hidden border-border/50 ${className}`}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-xl sm:text-3xl font-bold tracking-tight">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground truncate">{description}</p>
            )}
            {trend && (
              <p className="text-xs font-medium text-primary">{trend}</p>
            )}
          </div>
          <div className="flex-shrink-0 ml-3 p-2 sm:p-3 rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
        </div>
      </CardContent>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0" />
    </Card>
  );
}
