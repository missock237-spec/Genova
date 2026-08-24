'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Plus,
  Loader2,
  AlertCircle,
  Search,
  Code,
  BarChart3,
  PenTool,
  Languages,
  ImageIcon,
  Mail,
  FileText,
  Globe,
  MessageSquare,
  ArrowLeft,
  Zap,
  Database,
  Power,
  Edit,
  Trash2,
  Eye,
  Cpu,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdProvider } from '@/components/shared/ad-context';
import { ChatPanel } from '@/components/chat/chat-panel';
import { AgentCreateDialog } from './agent-create-dialog';
import { AgentDetailView } from './agent-detail-view';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

export interface Agent {
  id: string;
  name: string;
  type: string;
  description: string;
  status: string;
  config: string;
  avatar?: string | null;
  _count?: { tasks: number };
  permissions?: Array<{
    id: string;
    permission: string;
    granted: boolean;
    requiresApproval: boolean;
  }>;
}

// ============================================================
// Skills / Compétences definition
// ============================================================

export interface SkillDef {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  category: string;
}

export const AVAILABLE_SKILLS: SkillDef[] = [
  {
    id: 'web_search',
    label: 'Recherche web',
    description: 'Recherche d\'informations en temps réel sur le web',
    icon: Search,
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
    category: 'Recherche',
  },
  {
    id: 'code_generation',
    label: 'Génération de code',
    description: 'Écriture et débogage de code dans différents langages',
    icon: Code,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
    category: 'Développement',
  },
  {
    id: 'data_analysis',
    label: 'Analyse de données',
    description: 'Analyse et interprétation de données complexes',
    icon: BarChart3,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    category: 'Analyse',
  },
  {
    id: 'writing',
    label: 'Rédaction',
    description: 'Rédaction de contenus, articles, emails et documents',
    icon: PenTool,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
    category: 'Création',
  },
  {
    id: 'translation',
    label: 'Traduction',
    description: 'Traduction entre différentes langues',
    icon: Languages,
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10',
    category: 'Langue',
  },
  {
    id: 'image_generation',
    label: 'Génération d\'images',
    description: 'Création d\'images et de visuels avec l\'IA',
    icon: ImageIcon,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    category: 'Création',
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Envoi et gestion de courriels',
    icon: Mail,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    category: 'Communication',
  },
  {
    id: 'document_analysis',
    label: 'Analyse de documents',
    description: 'Extraction et analyse de contenus documentaires',
    icon: FileText,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    category: 'Analyse',
  },
];

// ============================================================
// Helpers
// ============================================================

export function parseAgentConfig(configStr: string): Record<string, unknown> {
  try {
    return JSON.parse(configStr || '{}');
  } catch {
    return {};
  }
}

export function getAgentSkills(agent: Agent): string[] {
  const cfg = parseAgentConfig(agent.config);
  return Array.isArray(cfg.skills) ? (cfg.skills as string[]) : [];
}

const typeLabels: Record<string, string> = {
  social_media: 'Social Media',
  browser: 'Navigateur',
  sales: 'Commercial',
  support: 'Support',
  marketing: 'Marketing',
  research: 'Recherche',
  rh: 'RH',
  accounting: 'Comptabilité',
  custom: 'Personnalisé',
};

// ============================================================
// Tab 1: Mes Agents
// ============================================================

function AgentsTab({
  agents,
  loading,
  error,
 onRefresh,
  onSelectAgent,
  onOpenCreate,
  onEditAgent,
}: {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectAgent: (id: string) => void;
  onOpenCreate: (editAgent?: Agent | null) => void;
  onEditAgent: (agent: Agent) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#06b6d4] mb-3" />
        <p className="text-sm text-muted-foreground">Chargement de vos agents...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <p className="text-sm font-medium">Erreur de chargement</p>
        <p className="text-xs text-muted-foreground mb-4">{error}</p>
        <Button variant="outline" onClick={onRefresh}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="p-4 rounded-2xl bg-[#06b6d4]/10 mb-4">
          <Bot className="h-12 w-12 text-[#06b6d4]/60" />
        </div>
        <h3 className="text-lg font-semibold mb-1">Aucun agent créé</h3>
        <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
          Créez votre premier agent IA personnalisé pour automatiser vos tâches quotidiennes.
        </p>
        <Button onClick={() => onOpenCreate()} className="gap-2">
          <Plus className="h-4 w-4" />
          Créer mon premier agent
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const skills = getAgentSkills(agent);
          const cfg = parseAgentConfig(agent.config);
          const tools: string[] = Array.isArray(cfg.tools) ? (cfg.tools as string[]) : [];
          const totalSkills = skills.length + tools.length;
          const isActive = agent.status === 'active';
          const typeLabel = typeLabels[agent.type] || agent.type;

          return (
            <Card
              key={agent.id}
              className="group border-border/50 hover:border-[#06b6d4]/30 transition-all cursor-pointer rounded-xl"
              onClick={() => onSelectAgent(agent.id)}
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl flex-shrink-0 ${isActive ? 'bg-[#06b6d4]/10' : 'bg-muted'}`}>
                      <Bot className={`h-5 w-5 ${isActive ? 'text-[#06b6d4]' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground">{typeLabel}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] flex-shrink-0 ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isActive ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>

                {agent.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                    {agent.description}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {totalSkills > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Sparkles className="h-3 w-3 text-[#06b6d4]" />
                        <span>{totalSkills} compétence{totalSkills > 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {agent._count && agent._count.tasks > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Zap className="h-3 w-3 text-amber-500" />
                        <span>{agent._count.tasks} tâche{agent._count.tasks > 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onEditAgent(agent)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Floating create button */}
      <Button
        onClick={() => onOpenCreate()}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg shadow-[#06b6d4]/20 gap-2 z-40 bg-[#06b6d4] hover:bg-[#06b6d4]/90 text-white"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}

// ============================================================
// Tab 2: Chat — Délégué au composant unifié ChatPanel
// ============================================================

function ChatTab({ agents, onOpenCreate }: { agents: Agent[]; onOpenCreate: () => void }) {
  return <ChatPanel agents={agents} onOpenCreate={onOpenCreate} />;
}

// ============================================================
// Main exported component
// ============================================================

function AgentsViewInner() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('agents');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);

  const { toast } = useToast();

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    // Retry rapide — backoff court pour ne pas bloquer l'UI mobile
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const data = await apiFetch<Agent[]>('/api/agents', {
          timeoutMs: attempt === 1 ? 15000 : 10000, // 15s puis 10s
        });
        setAgents(Array.isArray(data) ? data : []);
        setLoading(false);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[agents-view] fetchAgents attempt ${attempt}/3 failed:`, msg);
        if (attempt >= 3) {
          setAgents([]);
          setFetchError(msg.includes('fetch') ? 'Erreur réseau — vérifiez votre connexion' : msg);
          setLoading(false);
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }, []);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const handleSelectAgent = useCallback((id: string) => {
    setSelectedAgentId(id);
    setActiveTab('detail');
  }, []);

  const handleOpenCreate = useCallback((agent?: Agent | null) => {
    if (agent) {
      setEditAgent(agent);
    } else {
      setEditAgent(null);
    }
    setCreateOpen(true);
  }, []);

  const handleEditAgent = useCallback((agent: Agent) => {
    setEditAgent(agent);
    setCreateOpen(true);
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setSelectedAgentId(null);
    setActiveTab('agents');
    fetchAgents();
  }, [fetchAgents]);

  const handleToggle = useCallback(
    async (id: string) => {
      try {
        const agent = agents.find((a) => a.id === id);
        if (!agent) return;
        const newStatus = agent.status === 'active' ? 'inactive' : 'active';
        await apiFetch(`/api/agents/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        });
        toast({
          title: newStatus === 'active' ? 'Agent activé' : 'Agent désactivé',
          description: `${agent.name} est maintenant ${newStatus === 'active' ? 'actif' : 'inactif'}`,
        });
        fetchAgents();
      } catch (err) {
        toast({
          title: 'Erreur',
          description: err instanceof Error ? err.message : 'Impossible de modifier le statut',
          variant: 'destructive',
        });
      }
    },
    [agents, toast, fetchAgents]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/agents/${id}`, { method: 'DELETE' });
        toast({ title: 'Agent supprimé', description: "L'agent a été supprimé avec succès" });
        if (selectedAgentId === id) {
          setSelectedAgentId(null);
          setActiveTab('agents');
        }
        fetchAgents();
      } catch (err) {
        toast({
          title: 'Erreur',
          description: err instanceof Error ? err.message : 'Impossible de supprimer',
          variant: 'destructive',
        });
      }
    },
    [selectedAgentId, toast, fetchAgents]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="agents" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Mes Agents</span>
            <span className="sm:hidden">Agents</span>
            {agents.length > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-1 px-1.5">
                {agents.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Chat</span>
          </TabsTrigger>
          <TabsTrigger value="detail" className="gap-1.5" disabled={!selectedAgentId}>
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Détail</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="flex-1 min-h-0 mt-4 overflow-y-auto">
          <AgentsTab
            agents={agents}
            loading={loading}
            error={fetchError}
            onRefresh={fetchAgents}
            onSelectAgent={handleSelectAgent}
            onOpenCreate={handleOpenCreate}
            onEditAgent={handleEditAgent}
          />
        </TabsContent>

        <TabsContent value="chat" className="flex-1 min-h-0 mt-0 overflow-hidden">
          <ChatTab agents={agents} onOpenCreate={handleOpenCreate} />
        </TabsContent>

        <TabsContent value="detail" className="flex-1 min-h-0 mt-4 overflow-y-auto">
          {selectedAgentId ? (
            <AgentDetailView
              agentId={selectedAgentId}
              onBack={handleBackFromDetail}
              onEdit={handleEditAgent}
              onDelete={handleDelete}
              onToggle={handleToggle}
              onRefresh={fetchAgents}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Eye className="h-10 w-10 opacity-30 mb-3" />
              <p className="text-sm font-medium">Aucun agent sélectionné</p>
              <p className="text-xs mt-1">Cliquez sur un agent dans l'onglet « Mes Agents » pour voir ses détails.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AgentCreateDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setEditAgent(null);
        }}
        onSuccess={fetchAgents}
        editAgent={editAgent}
      />
    </div>
  );
}

export function AgentsView() {
  return (
    <AdProvider>
      <AgentsViewInner />
    </AdProvider>
  );
}
