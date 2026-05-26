'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Workflow, Play, Trash2, Eye, Clock, CheckCircle2, XCircle, Loader2, Pause } from 'lucide-react';

const statusConfig: Record<string, { color: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft: { color: 'bg-muted text-muted-foreground border-border', label: 'Brouillon', icon: Clock },
  active: { color: 'bg-primary/10 text-primary border-primary/20', label: 'Actif', icon: Play },
  paused: { color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', label: 'En pause', icon: Pause },
  completed: { color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', label: 'Terminé', icon: CheckCircle2 },
};

interface WorkflowData {
  id: string;
  name: string;
  description: string;
  status: string;
  steps: string;
  trigger: string;
  _count?: { tasks: number };
  createdAt: string;
  updatedAt: string;
}

interface WorkflowCardProps {
  workflow: WorkflowData;
  onExecute: (id: string) => void;
  onDelete: (id: string) => void;
  onView: (workflow: WorkflowData) => void;
}

export function WorkflowCard({ workflow, onExecute, onDelete, onView }: WorkflowCardProps) {
  const config = statusConfig[workflow.status] || statusConfig.draft;
  const StatusIcon = config.icon;

  let stepsCount = 0;
  try {
    const steps = JSON.parse(workflow.steps || '[]');
    stepsCount = steps.length;
  } catch {
    // ignore
  }

  return (
    <Card className="group border-border/50 hover:border-primary/30 transition-all">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Workflow className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{workflow.name}</h3>
              <p className="text-xs text-muted-foreground">{stepsCount} étape(s)</p>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] ${config.color}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{workflow.description}</p>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {workflow._count?.tasks || 0} tâche(s)
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onView(workflow)}>
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onExecute(workflow.id)}
              disabled={workflow.status === 'active'}
            >
              <Play className="h-3.5 w-3.5 text-primary" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive/70 hover:text-destructive"
              onClick={() => onDelete(workflow.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
