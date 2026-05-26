'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Bot, Power, Trash2, Eye, Mail, MessageSquare, Search, Calendar, Database, Phone } from 'lucide-react';

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  sales: Phone,
  support: MessageSquare,
  marketing: Mail,
  research: Search,
  rh: Database,
  accounting: Database,
  custom: Bot,
};

const typeLabels: Record<string, string> = {
  sales: 'Commercial',
  support: 'Support',
  marketing: 'Marketing',
  research: 'Recherche',
  rh: 'RH',
  accounting: 'Comptabilité',
  custom: 'Personnalisé',
};

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  inactive: 'bg-muted text-muted-foreground border-border',
  error: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const statusLabels: Record<string, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  error: 'Erreur',
};

interface Agent {
  id: string;
  name: string;
  type: string;
  description: string;
  status: string;
  config: string;
  avatar?: string | null;
  _count?: { tasks: number };
}

interface AgentCardProps {
  agent: Agent;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (agent: Agent) => void;
}

export function AgentCard({ agent, onToggle, onDelete, onEdit }: AgentCardProps) {
  const Icon = typeIcons[agent.type] || Bot;
  const isActive = agent.status === 'active';

  let configTools: string[] = [];
  try {
    const parsed = JSON.parse(agent.config || '{}');
    configTools = parsed.tools || [];
  } catch {
    // ignore
  }

  const toolIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    email: Mail,
    whatsapp: MessageSquare,
    crm: Database,
    web_search: Search,
    calendar: Calendar,
  };

  return (
    <Card className={`group border-border/50 hover:border-primary/30 transition-all ${isActive ? 'agent-glow' : ''}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isActive ? 'bg-primary/10' : 'bg-muted'}`}>
              <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
              <p className="text-xs text-muted-foreground">{typeLabels[agent.type] || agent.type}</p>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] ${statusColors[agent.status]}`}>
            {statusLabels[agent.status] || agent.status}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{agent.description}</p>

        {/* Tools */}
        {configTools.length > 0 && (
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {configTools.map((tool) => {
              const ToolIcon = toolIcons[tool];
              return ToolIcon ? (
                <div key={tool} className="p-1 rounded bg-muted/50" title={tool}>
                  <ToolIcon className="h-3 w-3 text-muted-foreground" />
                </div>
              ) : null;
            })}
          </div>
        )}

        {/* Task count */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {agent._count?.tasks || 0} tâche(s)
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(agent)}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onToggle(agent.id)}
            >
              <Power className={`h-3.5 w-3.5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive/70 hover:text-destructive"
              onClick={() => onDelete(agent.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
