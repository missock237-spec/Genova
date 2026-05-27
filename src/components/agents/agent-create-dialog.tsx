'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, MessageCircle, Smartphone, Calendar, Search, Users, Database, Plug, GitBranch, Clock, BarChart3, Heart, Target, Code, FileText, ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/lib/store';
import { AGENT_TOOLS, getToolsForAgentType, type AgentTool } from '@/lib/agent-tools';

interface AgentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editAgent?: {
    id: string;
    name: string;
    type: string;
    description: string;
    config: string;
  } | null;
}

const agentTypes = [
  { value: 'sales', label: 'Commercial' },
  { value: 'support', label: 'Support' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'research', label: 'Recherche' },
  { value: 'rh', label: 'RH' },
  { value: 'accounting', label: 'Comptabilité' },
  { value: 'custom', label: 'Personnalisé' },
];

const toolIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Mail,
  MessageCircle,
  Smartphone,
  Calendar,
  Search,
  Users,
  Database,
  Plug,
  GitBranch,
  Clock,
  BarChart3,
  Heart,
  Target,
  Code,
  FileText,
  Image: ImageIcon,
};

const categoryLabels: Record<string, string> = {
  communication: 'Communication',
  data: 'Données',
  automation: 'Automatisation',
  analysis: 'Analyse',
  creation: 'Création',
};

const categoryColors: Record<string, string> = {
  communication: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  data: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  automation: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  analysis: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  creation: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
};

export function AgentCreateDialog({ open, onOpenChange, onSuccess, editAgent }: AgentCreateDialogProps) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const parseConfig = (configStr: string) => {
    try {
      return JSON.parse(configStr || '{}');
    } catch {
      return {};
    }
  };

  const [form, setForm] = useState({
    name: editAgent?.name || '',
    type: editAgent?.type || '',
    description: editAgent?.description || '',
    instructions: editAgent ? parseConfig(editAgent.config).instructions || '' : '',
    personality: editAgent ? parseConfig(editAgent.config).personality || 'professional' : 'professional',
    selectedTools: editAgent ? parseConfig(editAgent.config).tools || [] : [] as string[],
  });

  // Get recommended tools based on agent type
  const recommendedTools = useMemo(() => {
    if (!form.type) return AGENT_TOOLS;
    return getToolsForAgentType(form.type);
  }, [form.type]);

  // Group tools by category
  const toolsByCategory = useMemo(() => {
    const categories: Record<string, AgentTool[]> = {};
    for (const tool of recommendedTools) {
      if (!categories[tool.category]) {
        categories[tool.category] = [];
      }
      categories[tool.category].push(tool);
    }
    return categories;
  }, [recommendedTools]);

  const handleToolToggle = (toolId: string) => {
    setForm((prev) => ({
      ...prev,
      selectedTools: prev.selectedTools.includes(toolId)
        ? prev.selectedTools.filter((t: string) => t !== toolId)
        : [...prev.selectedTools, toolId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.type) {
      toast({ title: 'Erreur', description: 'Nom et type requis', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const config = {
        instructions: form.instructions,
        personality: form.personality,
        tools: form.selectedTools,
      };

      const url = editAgent ? `/api/agents/${editAgent.id}` : '/api/agents';
      const method = editAgent ? 'PUT' : 'POST';
      const body = editAgent
        ? { name: form.name, type: form.type, description: form.description, config }
        : { name: form.name, type: form.type, description: form.description, config };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({ title: 'Erreur', description: data.error, variant: 'destructive' });
        return;
      }

      toast({
        title: editAgent ? 'Agent modifié' : 'Agent créé',
        description: `${form.name} a été ${editAgent ? 'modifié' : 'créé'} avec succès`,
      });
      onOpenChange(false);
      onSuccess();
      setForm({ name: '', type: '', description: '', instructions: '', personality: 'professional', selectedTools: [] });
    } catch {
      toast({ title: 'Erreur', description: 'Erreur serveur', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editAgent ? 'Modifier l\'agent' : 'Créer un agent IA'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nom de l&apos;agent</Label>
            <Input
              placeholder="Ex: Agent Commercial Pro"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un type" />
              </SelectTrigger>
              <SelectContent>
                {agentTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Décrivez le rôle de cet agent..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Instructions</Label>
            <Textarea
              placeholder="Instructions spécifiques pour l'agent..."
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Personnalité</Label>
            <Select value={form.personality} onValueChange={(value) => setForm({ ...form, personality: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professionnel</SelectItem>
                <SelectItem value="friendly">Amical</SelectItem>
                <SelectItem value="formal">Formel</SelectItem>
                <SelectItem value="creative">Créatif</SelectItem>
                <SelectItem value="analytical">Analytique</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Enhanced Tools Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Outils</Label>
              {form.type && (
                <Badge variant="outline" className="text-[10px]">
                  {recommendedTools.length} outil(s) recommandé(s)
                </Badge>
              )}
            </div>

            {Object.entries(toolsByCategory).map(([category, tools]) => (
              <div key={category} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] h-5 ${categoryColors[category] || ''}`}>
                    {categoryLabels[category] || category}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 pl-1">
                  {tools.map((tool) => {
                    const ToolIcon = toolIconMap[tool.icon];
                    return (
                      <div
                        key={tool.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                          form.selectedTools.includes(tool.id)
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border/50 hover:border-primary/20'
                        }`}
                        onClick={() => handleToolToggle(tool.id)}
                      >
                        <Checkbox
                          id={tool.id}
                          checked={form.selectedTools.includes(tool.id)}
                          onCheckedChange={() => handleToolToggle(tool.id)}
                          className="pointer-events-none"
                        />
                        {ToolIcon && <ToolIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                        <label htmlFor={tool.id} className="text-xs cursor-pointer truncate">
                          {tool.name}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {form.selectedTools.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {form.selectedTools.map((toolId: string) => {
                  const tool = AGENT_TOOLS.find(t => t.id === toolId);
                  return tool ? (
                    <Badge key={toolId} variant="secondary" className="text-[10px] h-5 gap-1">
                      {tool.name}
                      <button
                        type="button"
                        className="ml-0.5 hover:text-destructive"
                        onClick={() => handleToolToggle(toolId)}
                      >
                        ×
                      </button>
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editAgent ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
