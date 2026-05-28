'use client';

import { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Globe,
  Youtube,
  Facebook,
  Instagram,
  Music2,
  Linkedin,
  Megaphone,
  MessageCircle,
  Phone,
  Cpu,
  Server,
  Zap,
  Mail,
  Database,
  Calendar,
  Search,
  Bot,
  Loader2,
  ShieldCheck,
  ShoppingCart,
  Headphones,
  TrendingUp,
  Microscope,
  Users,
  Calculator,
  Puzzle,
  Monitor,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

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
  { value: 'social_media', label: 'Social Media', icon: Megaphone },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'browser', label: 'Navigateur', icon: Monitor },
  { value: 'sales', label: 'Commercial', icon: ShoppingCart },
  { value: 'support', label: 'Support', icon: Headphones },
  { value: 'marketing', label: 'Marketing', icon: TrendingUp },
  { value: 'research', label: 'Recherche', icon: Microscope },
  { value: 'rh', label: 'RH', icon: Users },
  { value: 'accounting', label: 'Comptabilité', icon: Calculator },
  { value: 'custom', label: 'Personnalisé', icon: Puzzle },
];

const toolCategories = [
  {
    name: 'Navigation Web',
    tools: [
      { id: 'browse_web', label: 'Naviguer sur le web', icon: Globe, color: 'text-sky-500' },
    ],
  },
  {
    name: 'Réseaux Sociaux',
    tools: [
      { id: 'social_youtube', label: 'YouTube', icon: Youtube, color: 'text-red-500' },
      { id: 'social_facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-500' },
      { id: 'social_instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-500' },
      { id: 'social_tiktok', label: 'TikTok', icon: Music2, color: 'text-rose-400' },
      { id: 'social_linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-blue-400' },
      { id: 'social_post', label: 'Publier sur les réseaux', icon: Megaphone, color: 'text-orange-500' },
    ],
  },
  {
    name: 'WhatsApp',
    tools: [
      { id: 'whatsapp_message', label: 'Envoyer des messages', icon: MessageCircle, color: 'text-green-500' },
      { id: 'whatsapp_call', label: 'Passer des appels', icon: Phone, color: 'text-green-400' },
    ],
  },
  {
    name: 'Ressources',
    tools: [
      { id: 'use_api', label: 'Utiliser les APIs', icon: Zap, color: 'text-yellow-500' },
      { id: 'use_cpu', label: 'Utiliser le CPU', icon: Cpu, color: 'text-purple-400' },
      { id: 'use_mvp', label: 'Utiliser le MVP', icon: Server, color: 'text-emerald-500' },
    ],
  },
  {
    name: 'Classiques',
    tools: [
      { id: 'email', label: 'Email', icon: Mail, color: 'text-amber-500' },
      { id: 'crm', label: 'CRM', icon: Database, color: 'text-cyan-500' },
      { id: 'calendar', label: 'Calendrier', icon: Calendar, color: 'text-indigo-400' },
      { id: 'web_search', label: 'Recherche Web', icon: Search, color: 'text-teal-500' },
    ],
  },
];

interface ToolConfig {
  enabled: boolean;
  requiresApproval: boolean;
}

export function AgentCreateDialog({ open, onOpenChange, onSuccess, editAgent }: AgentCreateDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const parseConfig = (configStr: string) => {
    try {
      return JSON.parse(configStr || '{}');
    } catch {
      return {};
    }
  };

  const buildInitialTools = (): Record<string, ToolConfig> => {
    const tools: Record<string, ToolConfig> = {};
    toolCategories.forEach((cat) => {
      cat.tools.forEach((tool) => {
        tools[tool.id] = { enabled: false, requiresApproval: true };
      });
    });
    if (editAgent) {
      const parsed = parseConfig(editAgent.config);
      const enabledTools: string[] = parsed.tools || [];
      const approvalTools: string[] = parsed.approvalTools || [];
      enabledTools.forEach((t: string) => {
        if (tools[t]) {
          tools[t].enabled = true;
        }
      });
      approvalTools.forEach((t: string) => {
        if (tools[t]) {
          tools[t].requiresApproval = true;
        }
      });
      // If a tool is enabled, set its approval based on config
      if (parsed.toolConfigs) {
        Object.entries(parsed.toolConfigs as Record<string, ToolConfig>).forEach(([key, val]) => {
          if (tools[key]) {
            tools[key] = val;
          }
        });
      }
    }
    return tools;
  };

  const [form, setForm] = useState({
    name: editAgent?.name || '',
    type: editAgent?.type || '',
    description: editAgent?.description || '',
    instructions: editAgent ? parseConfig(editAgent.config).instructions || '' : '',
    personality: editAgent ? parseConfig(editAgent.config).personality || 'professional' : 'professional',
  });

  const [toolConfigs, setToolConfigs] = useState<Record<string, ToolConfig>>(buildInitialTools);

  const handleToolToggle = (toolId: string, field: 'enabled' | 'requiresApproval') => {
    setToolConfigs((prev) => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        [field]: !prev[toolId][field],
      },
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
      const enabledTools = Object.entries(toolConfigs)
        .filter(([, cfg]) => cfg.enabled)
        .map(([id]) => id);

      const config = {
        instructions: form.instructions,
        personality: form.personality,
        tools: enabledTools,
        toolConfigs: Object.fromEntries(
          Object.entries(toolConfigs).filter(([, cfg]) => cfg.enabled)
        ),
      };

      if (editAgent) {
        await apiFetch(`/api/agents/${editAgent.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: form.name, type: form.type, description: form.description, config }),
        });
      } else {
        await apiFetch('/api/agents', {
          method: 'POST',
          body: JSON.stringify({ name: form.name, type: form.type, description: form.description, config }),
        });
      }

      toast({
        title: editAgent ? 'Agent modifié' : 'Agent créé',
        description: `${form.name} a été ${editAgent ? 'modifié' : 'créé'} avec succès`,
      });
      onOpenChange(false);
      onSuccess();
      setForm({ name: '', type: '', description: '', instructions: '', personality: 'professional' });
      setToolConfigs(buildInitialTools());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur serveur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const enabledToolCount = Object.values(toolConfigs).filter((c) => c.enabled).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            {editAgent ? 'Modifier l\'agent' : 'Créer un agent IA'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
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
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
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
                rows={2}
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

            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                placeholder="Instructions spécifiques pour l'agent..."
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <Separator />

          {/* Tools/Capabilities Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Outils & Capacités</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configurez les permissions de l&apos;agent
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {enabledToolCount} outil{enabledToolCount !== 1 ? 's' : ''} activé{enabledToolCount !== 1 ? 's' : ''}
              </Badge>
            </div>

            {toolCategories.map((category) => (
              <div key={category.name} className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{category.name}</h4>
                <div className="space-y-2">
                  {category.tools.map((tool) => {
                    const config = toolConfigs[tool.id] || { enabled: false, requiresApproval: true };
                    return (
                      <div
                        key={tool.id}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                          config.enabled
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-border/50 bg-card'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-md ${config.enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                            <tool.icon className={`h-4 w-4 ${config.enabled ? tool.color : 'text-muted-foreground'}`} />
                          </div>
                          <span className={`text-sm ${config.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {tool.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {config.enabled && (
                            <div className="flex items-center gap-2">
                              <ShieldCheck className={`h-3.5 w-3.5 ${config.requiresApproval ? 'text-amber-500' : 'text-muted-foreground'}`} />
                              <span className="text-[10px] text-muted-foreground">Approbation</span>
                              <Switch
                                checked={config.requiresApproval}
                                onCheckedChange={() => handleToolToggle(tool.id, 'requiresApproval')}
                                className="scale-75"
                              />
                            </div>
                          )}
                          <Switch
                            checked={config.enabled}
                            onCheckedChange={() => handleToolToggle(tool.id, 'enabled')}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
