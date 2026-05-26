'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, Bot, Shield, Workflow, LogIn, LogOut, Trash2, Plus } from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  agent: Bot,
  workflow: Workflow,
  guardrail: Shield,
  auth: LogIn,
  system: Activity,
};

function getActionIcon(action: string) {
  if (action.includes('créé') || action.includes('Créé')) return Plus;
  if (action.includes('supprimé') || action.includes('Supprimé')) return Trash2;
  if (action.includes('Connexion')) return LogIn;
  if (action.includes('Déconnexion')) return LogOut;
  return Activity;
}

interface ActivityItem {
  id: string;
  action: string;
  details: string;
  category: string;
  createdAt: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Aucune activité récente</p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-96">
      <div className="space-y-3 pr-2 custom-scrollbar">
        {activities.map((activity) => {
          const Icon = iconMap[activity.category] || getActionIcon(activity.action);
          return (
            <div key={activity.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex-shrink-0 p-1.5 rounded-md bg-primary/10 mt-0.5">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{activity.action}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(activity.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
