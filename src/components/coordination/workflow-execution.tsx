'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';

interface ExecutionTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  agent?: { name: string; type: string } | null;
}

interface WorkflowExecutionProps {
  workflowName: string;
  tasks: ExecutionTask[];
}

export function WorkflowExecution({ workflowName, tasks }: WorkflowExecutionProps) {
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const total = tasks.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    pending: Clock,
    running: Loader2,
    completed: CheckCircle2,
    failed: XCircle,
    validated: CheckCircle2,
  };

  const statusColors: Record<string, string> = {
    pending: 'text-muted-foreground',
    running: 'text-primary',
    completed: 'text-emerald-500',
    failed: 'text-red-500',
    validated: 'text-blue-500',
  };

  const statusLabels: Record<string, string> = {
    pending: 'En attente',
    running: 'En cours',
    completed: 'Terminé',
    failed: 'Échoué',
    validated: 'Validé',
    rejected: 'Rejeté',
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Exécution: {workflowName}</span>
          <Badge variant="outline" className="text-[10px]">
            {completed}/{total}
          </Badge>
        </CardTitle>
        <Progress value={progress} className="h-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.map((task) => {
          const Icon = statusIcons[task.status] || Clock;
          return (
            <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
              <Icon className={`h-4 w-4 ${task.status === 'running' ? 'animate-spin' : ''} ${statusColors[task.status] || ''}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{task.title}</p>
                {task.agent && (
                  <p className="text-[10px] text-muted-foreground">{task.agent.name}</p>
                )}
              </div>
              <Badge variant="outline" className="text-[10px] h-5">
                {statusLabels[task.status] || task.status}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
