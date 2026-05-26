'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, ArrowDown, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';

interface WorkflowStep {
  title: string;
  description?: string;
  agentType?: string;
  agentId?: string;
  priority?: string;
  status?: string;
}

interface WorkflowBuilderProps {
  steps: WorkflowStep[];
  workflowName?: string;
  workflowStatus?: string;
}

const stepStatusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
};

const stepStatusColors: Record<string, string> = {
  pending: 'border-muted bg-muted/30',
  running: 'border-primary/50 bg-primary/5 animate-pulse-emerald',
  completed: 'border-emerald-500/50 bg-emerald-500/5',
  failed: 'border-red-500/50 bg-red-500/5',
};

const agentTypeLabels: Record<string, string> = {
  sales: 'Commercial',
  support: 'Support',
  marketing: 'Marketing',
  research: 'Recherche',
  rh: 'RH',
  accounting: 'Comptabilité',
  custom: 'Personnalisé',
};

export function WorkflowBuilder({ steps, workflowName, workflowStatus }: WorkflowBuilderProps) {
  if (steps.length === 0) {
    return (
      <Card className="border-border/50 border-dashed">
        <CardContent className="p-8 text-center text-muted-foreground">
          <p className="text-sm">Aucune étape définie</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      {workflowName && (
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            {workflowName}
            {workflowStatus && (
              <Badge variant="outline" className="text-[10px] ml-auto">
                {workflowStatus}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-0">
        {steps.map((step, i) => {
          const StatusIcon = stepStatusIcons[step.status || 'pending'] || Clock;
          const colorClass = stepStatusColors[step.status || 'pending'] || stepStatusColors.pending;

          return (
            <div key={i}>
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${colorClass} transition-all`}>
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                    {i + 1}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium">{step.title}</p>
                    <StatusIcon className={`h-3.5 w-3.5 ${step.status === 'running' ? 'animate-spin' : ''} text-primary`} />
                  </div>
                  {step.description && (
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  )}
                  <div className="flex gap-1.5 mt-1.5">
                    {step.agentType && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        {agentTypeLabels[step.agentType] || step.agentType}
                      </Badge>
                    )}
                    {step.priority && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        {step.priority}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown className="h-4 w-4 text-primary/30" />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
