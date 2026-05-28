'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Bot,
  Power,
  Trash2,
  Eye,
  Mail,
  MessageSquare,
  Search,
  Calendar,
  Database,
  Phone,
  Megaphone,
  Monitor,
  Globe,
  Youtube,
  Facebook,
  Instagram,
  Linkedin,
  Zap,
  Cpu,
  Server,
  MessageCircle,
} from 'lucide-react';

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  social_media: Megaphone,
  whatsapp: MessageCircle,
  browser: Monitor,
  sales: Phone,
  support: MessageSquare,
  marketing: Mail,
  research: Search,
  rh: Database,
  accounting: Database,
  custom: Bot,
};

const typeLabels: Record<string, string> = {
  social_media: 'Social Media',
  whatsapp: 'WhatsApp',
  browser: 'Navigateur',
  sales: 'Commercial',
  support: 'Support',
  marketing: 'Marketing',
  research: 'Recherche',
  rh: 'RH',
  accounting: 'Comptabilité',
  custom: 'Personnalisé',
};

const typeColors: Record<string, string> = {
  social_media: 'bg-pink-500/10 text-pink-500',
  whatsapp: 'bg-green-500/10 text-green-500',
  browser: 'bg-sky-500/10 text-sky-500',
  sales: 'bg-amber-500/10 text-amber-500',
  support: 'bg-teal-500/10 text-teal-500',
  marketing: 'bg-orange-500/10 text-orange-500',
  research: 'bg-purple-500/10 text-purple-500',
  rh: 'bg-cyan-500/10 text-cyan-500',
  accounting: 'bg-emerald-500/10 text-emerald-500',
  custom: 'bg-muted text-muted-foreground',
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

const toolIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  browse_web: Globe,
  social_youtube: Youtube,
  social_facebook: Facebook,
  social_instagram: Instagram,
  social_tiktok: MessageSquare,
  social_linkedin: Linkedin,
  social_post: Megaphone,
  whatsapp_message: MessageCircle,
  whatsapp_call: Phone,
  use_api: Zap,
  use_cpu: Cpu,
  use_mvp: Server,
  email: Mail,
  crm: Database,
  calendar: Calendar,
  web_search: Search,
};

const toolColors: Record<string, string> = {
  browse_web: 'text-sky-500',
  social_youtube: 'text-red-500',
  social_facebook: 'text-blue-500',
  social_instagram: 'text-pink-500',
  social_tiktok: 'text-white',
  social_linkedin: 'text-blue-400',
  social_post: 'text-orange-500',
  whatsapp_message: 'text-green-500',
  whatsapp_call: 'text-green-400',
  use_api: 'text-yellow-500',
  use_cpu: 'text-purple-400',
  use_mvp: 'text-emerald-500',
  email: 'text-amber-500',
  crm: 'text-cyan-500',
  calendar: 'text-indigo-400',
  web_search: 'text-teal-500',
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
  permissions?: Array<{ id: string; permission: string; granted: boolean; requiresApproval: boolean }>;
}

interface AgentCardProps {
  agent: Agent;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (agent: Agent) => void;
  onSelect: (agent: Agent) => void;
}

export function AgentCard({ agent, onToggle, onDelete, onEdit, onSelect }: AgentCardProps) {
  const Icon = typeIcons[agent.type] || Bot;
  const isActive = agent.status === 'active';
  const typeColor = typeColors[agent.type] || 'bg-muted text-muted-foreground';

  let configTools: string[] = [];
  let toolConfigs: Record<string, { enabled: boolean; requiresApproval: boolean }> = {};
  try {
    const parsed = JSON.parse(agent.config || '{}');
    configTools = parsed.tools || [];
    if (parsed.toolConfigs) {
      toolConfigs = parsed.toolConfigs;
    }
  } catch {
    // ignore
  }

  // Count social accounts and check browser/whatsapp
  const socialTools = configTools.filter((t) => t.startsWith('social_'));
  const hasBrowser = configTools.includes('browse_web');
  const hasWhatsApp = configTools.includes('whatsapp_message') || configTools.includes('whatsapp_call');

  // Get enabled permissions from the agent
  const grantedPermissions = agent.permissions?.filter((p) => p.granted).map((p) => p.permission) || [];

  return (
    <Card
      className={`group border-border/50 hover:border-primary/30 transition-all cursor-pointer ${isActive ? 'agent-glow' : ''}`}
      onClick={() => onSelect(agent)}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl relative ${isActive ? typeColor : 'bg-muted'}`}>
              <Icon className={`h-5 w-5 ${isActive ? '' : 'text-muted-foreground'}`} />
              {/* Active browser indicator */}
              {hasBrowser && isActive && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card status-active" />
              )}
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

        {/* Tool badges with colored icons */}
        {configTools.length > 0 && (
          <div className="flex gap-1 mb-3 flex-wrap">
            {configTools.slice(0, 6).map((tool) => {
              const ToolIcon = toolIcons[tool];
              return ToolIcon ? (
                <div
                  key={tool}
                  className="p-1.5 rounded-md bg-muted/50 border border-border/30"
                  title={tool}
                >
                  <ToolIcon className={`h-3 w-3 ${toolColors[tool] || 'text-muted-foreground'}`} />
                </div>
              ) : null;
            })}
            {configTools.length > 6 && (
              <Badge variant="secondary" className="text-[10px] h-6">
                +{configTools.length - 6}
              </Badge>
            )}
          </div>
        )}

        {/* Status indicators */}
        <div className="flex items-center gap-3 mb-3">
          {socialTools.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Megaphone className="h-3 w-3 text-pink-500" />
              {socialTools.length} réseau{socialTools.length > 1 ? 'x' : ''}
            </div>
          )}
          {hasWhatsApp && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MessageCircle className="h-3 w-3 text-green-500" />
              WhatsApp
            </div>
          )}
          {hasBrowser && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Globe className="h-3 w-3 text-sky-500" />
              Navigateur
            </div>
          )}
          {grantedPermissions.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Zap className="h-3 w-3 text-yellow-500" />
              {grantedPermissions.length} permission{grantedPermissions.length > 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Task count and actions */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {agent._count?.tasks || 0} tâche(s)
          </span>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
