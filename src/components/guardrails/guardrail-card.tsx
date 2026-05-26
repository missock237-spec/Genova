'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Shield, Power, Trash2, Eye, AlertTriangle, Info, ShieldAlert, ShieldCheck } from 'lucide-react';

const typeLabels: Record<string, string> = {
  content_check: 'Vérification contenu',
  risk_analysis: 'Analyse de risque',
  permission_gate: 'Porte de permission',
  logic_verify: 'Vérification logique',
  custom: 'Personnalisé',
};

const severityConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  info: { icon: Info, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', label: 'Info' },
  warning: { icon: AlertTriangle, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', label: 'Avertissement' },
  critical: { icon: ShieldAlert, color: 'bg-orange-500/10 text-orange-600 border-orange-500/20', label: 'Critique' },
  blocking: { icon: ShieldAlert, color: 'bg-red-500/10 text-red-600 border-red-500/20', label: 'Bloquant' },
};

interface GuardrailCardProps {
  guardrail: {
    id: string;
    name: string;
    type: string;
    description: string;
    severity: string;
    isActive: boolean;
    rules: string;
  };
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (guardrail: GuardrailCardProps['guardrail']) => void;
}

export function GuardrailCard({ guardrail, onToggle, onDelete, onEdit }: GuardrailCardProps) {
  const severity = severityConfig[guardrail.severity] || severityConfig.warning;
  const SeverityIcon = severity.icon;

  return (
    <Card className={`group border-border/50 hover:border-primary/30 transition-all ${guardrail.isActive ? 'agent-glow' : ''}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${guardrail.isActive ? 'bg-primary/10' : 'bg-muted'}`}>
              <Shield className={`h-5 w-5 ${guardrail.isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{guardrail.name}</h3>
              <p className="text-xs text-muted-foreground">{typeLabels[guardrail.type] || guardrail.type}</p>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] ${severity.color}`}>
            <SeverityIcon className="h-3 w-3 mr-1" />
            {severity.label}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{guardrail.description}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              checked={guardrail.isActive}
              onCheckedChange={() => onToggle(guardrail.id)}
              className="scale-75"
            />
            <span className="text-[10px] text-muted-foreground">
              {guardrail.isActive ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <ShieldCheck className="h-3 w-3" /> Actif
                </span>
              ) : (
                <span className="text-muted-foreground">Inactif</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(guardrail)}>
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => onDelete(guardrail.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
