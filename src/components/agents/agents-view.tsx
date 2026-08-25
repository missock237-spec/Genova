'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot,
  User,
  Send,
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
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Zap,
  Database,
  Power,
  Edit,
  Trash2,
  Eye,
  Cpu,
  Square,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AdProvider, useAdContext } from '@/components/shared/ad-context';
import { AdBanner } from '@/components/shared/ad-banner';
import { AgentResponse } from '@/components/shared/agent-response';
import { BorderBeam } from '@/components/ui/border-beam';
import { AgentCreateDialog } from './agent-create-dialog';
import { AgentDetailView } from './agent-detail-view';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';

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
  // New 20 agent types
  developer: 'Développeur Full-Stack',
  data_analyst: 'Analyste de Données',
  devops: 'Ingénieur DevOps',
  security_expert: 'Expert Cybersécurité',
  copywriter: 'Copywriter',
  social_media_manager: 'Community Manager',
  seo_specialist: 'Spécialiste SEO',
  business_advisor: 'Conseiller Business',
  sales_agent: 'Agent Commercial',
  project_manager: 'Chef de Projet',
  content_creator: 'Créateur de Contenu',
  translator: 'Traducteur Multilingue',
  graphic_designer: 'Designer Graphique',
  customer_support: 'Support Client',
  email_assistant: 'Assistant Email',
  researcher: 'Chercheur Académique',
  legal_advisor: 'Assistant Juridique',
  financial_analyst: 'Analyste Financier',
  hr_assistant: 'Assistant RH',
  general_assistant: 'Assistant Général',
  tutor: 'Tuteur Éducatif',
  // Legacy types (backward compat)
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
// Suggestions de prompts
// ============================================================

const PROMPT_SUGGESTIONS = [
  'Résume ce document',
  'Crée un plan marketing',
  'Analyse mes données',
  'Écris un email professionnel',
  'Génère du code Python',
  'Traduis ce texte en anglais',
];

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
              className="group border-border/50 hover:border-[#06b6d4]/30 transition-all cursor-pointer rounded-xl overflow-hidden"
              onClick={() => onSelectAgent(agent.id)}
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl flex-shrink-0 relative ${isActive ? 'bg-[#06b6d4]/10' : 'bg-muted'}`}>
                      <Bot className={`h-5 w-5 ${isActive ? 'text-[#06b6d4]' : 'text-muted-foreground'}`} />
                      {isActive && (
                        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground">{typeLabel}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] flex-shrink-0 rounded-full ${
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
                      className="h-7 w-7 rounded-lg"
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
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg shadow-[#06b6d4]/20 gap-2 z-40 bg-gradient-to-br from-[#06b6d4] to-violet-500 hover:from-[#06b6d4]/90 hover:to-violet-500/90 text-white"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}

// ============================================================
// Tab 2: Chat — Interface nouvelle génération
// ============================================================

function ChatTab({ agents, onOpenCreate }: { agents: Agent[]; onOpenCreate: () => void }) {
  const { user } = useAuthStore();
  const { incMessageCount, trackAdEvent, creditBalance, lastRewardMessage, rewardStats } = useAdContext();
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  const userPlan = user?.plan || 'free';
  const isPaid = userPlan !== 'free';
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const isAgentActive = selectedAgent?.status === 'active';
  const remainingToday = rewardStats.maxPerDay - rewardStats.balance.today;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-select first active agent
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      const firstActive = agents.find((a) => a.status === 'active');
      if (firstActive) setSelectedAgentId(firstActive.id);
      else setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  // Reset messages on agent change
  useEffect(() => {
    setMessages([]);
    setError(null);
    conversationIdRef.current = null;
  }, [selectedAgentId]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 128) + 'px';
    }
  }, [input]);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsTyping(false);
  }, []);

  const handleSend = async (overrideText?: string) => {
    const text = overrideText || input;
    if (!text.trim() || isTyping || !selectedAgentId || !isAgentActive) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    const sentText = text.trim();
    setInput('');
    setIsTyping(true);
    setError(null);
    incMessageCount();

    requestAnimationFrame(() => textareaRef.current?.focus());

    // Historique pour le backend (12 derniers messages)
    const historyForBackend = [...messages, userMsg].slice(-12).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/agents/${selectedAgentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', credentials: 'include' },
        body: JSON.stringify({
          message: sentText,
          history: historyForBackend,
          conversationId: conversationIdRef.current || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `Erreur ${res.status}` }));
        throw new Error(errData.error || `Erreur ${res.status}`);
      }

      const convIdFromHeader = res.headers.get('X-Conversation-Id');
      if (convIdFromHeader && !conversationIdRef.current) {
        conversationIdRef.current = convIdFromHeader;
      }

      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        if (reader) {
          const agentMsgId = (Date.now() + 1).toString();
          setMessages((prev) => [
            ...prev,
            { id: agentMsgId, role: 'agent', content: '', timestamp: new Date() },
          ]);

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') break;
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.delta) {
                      fullContent += parsed.delta;
                      setMessages((prev) => {
                        const updated = [...prev];
                        const lastMsg = updated[updated.length - 1];
                        if (lastMsg && lastMsg.role === 'agent') {
                          updated[updated.length - 1] = { ...lastMsg, content: fullContent };
                        }
                        return updated;
                      });
                    } else if (parsed.content) {
                      fullContent = parsed.content;
                      setMessages((prev) => {
                        const updated = [...prev];
                        const lastMsg = updated[updated.length - 1];
                        if (lastMsg && lastMsg.role === 'agent') {
                          updated[updated.length - 1] = { ...lastMsg, content: fullContent };
                        }
                        return updated;
                      });
                    }
                  } catch {
                    // Skip invalid JSON chunks
                  }
                }
              }
            }
          } catch (abortErr) {
            if (abortErr instanceof DOMException && abortErr.name === 'AbortError') {
              if (!fullContent) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastMsg = updated[updated.length - 1];
                  if (lastMsg && lastMsg.role === 'agent') {
                    updated[updated.length - 1] = { ...lastMsg, content: 'Génération annulée.' };
                  }
                  return updated;
                });
              }
            } else throw abortErr;
          }

          if (!fullContent) {
            setMessages((prev) => {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              if (lastMsg && lastMsg.role === 'agent') {
                updated[updated.length - 1] = {
                  ...lastMsg,
                  content: "L'agent a traité votre demande.",
                };
              }
              return updated;
            });
          }
        }
      } else {
        const data = await res.json();
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: data.response || data.content || "L'agent a répondu.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, agentMsg]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const errMsg = err instanceof Error ? err.message : 'Erreur de communication';
      setError(errMsg);
      const fallbackMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: `Désolé, je n'ai pas pu contacter le serveur : ${errMsg}. Veuillez réessayer.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsTyping(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeAgents = agents.filter((a) => a.status === 'active');
  const inactiveAgents = agents.filter((a) => a.status !== 'active');

  return (
    <div className="flex flex-col h-[calc(100vh-16rem)] rounded-3xl border border-border/60 bg-card/40 backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/20">
      {/* Ad credit bar */}
      {isPaid && (
        <div className="flex items-center justify-between px-4 py-2 border-b bg-gradient-to-r from-emerald-500/5 to-green-500/5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <strong>{creditBalance.total}</strong> crédit{creditBalance.total > 1 ? 's' : ''} gagné{creditBalance.total > 1 ? 's' : ''}
            </span>
            {remainingToday > 0 && (
              <span className="text-[10px] text-muted-foreground">({remainingToday} dispo)</span>
            )}
          </div>
        </div>
      )}

      {lastRewardMessage && (
        <div className="px-4 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 text-center">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3 w-3 inline mr-1" />
            {lastRewardMessage}
          </span>
        </div>
      )}

      {/* Agent selector — sticky header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/60 bg-background/60 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/50">
        {/* Agent avatar with gradient ring */}
        <div className="relative flex-shrink-0">
          <div className="absolute -inset-[2px] rounded-xl bg-gradient-to-br from-[#06b6d4] to-violet-500 opacity-70 blur-sm" />
          <div className={cn('relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-slate-900', !isAgentActive && 'opacity-60')}>
            {selectedAgent?.avatar ? (
              <img src={selectedAgent.avatar} alt={selectedAgent.name} className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <Bot className={cn('h-4 w-4', isAgentActive ? 'text-[#00F5FF]' : 'text-muted-foreground')} />
            )}
          </div>
          <span className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background', isAgentActive ? 'bg-emerald-400' : 'bg-muted-foreground/40')} />
        </div>

        <div className="flex-1 min-w-0">
          <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
            <SelectTrigger className="h-9 border-0 shadow-none p-0 bg-transparent font-semibold text-sm">
              <SelectValue placeholder="Sélectionner un agent..." />
            </SelectTrigger>
            <SelectContent>
              {activeAgents.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Agents actifs</div>
                  {activeAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        {agent.name}
                      </div>
                    </SelectItem>
                  ))}
                </>
              )}
              {inactiveAgents.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Agents inactifs</div>
                  {inactiveAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        <XCircle className="h-3 w-3 text-muted-foreground" />
                        {agent.name}
                      </div>
                    </SelectItem>
                  ))}
                </>
              )}
              {agents.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                  Aucun agent disponible. Créez-en un dans l'onglet « Mes Agents ».
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
        {selectedAgent && (
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] whitespace-nowrap rounded-full px-2.5 py-0.5',
              isAgentActive
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <span className={cn('mr-1 inline-block h-1.5 w-1.5 rounded-full', isAgentActive ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground')} />
            {isAgentActive ? 'Actif' : 'Inactif'}
          </Badge>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <Alert variant="destructive" className="mx-4 mt-2 py-2 rounded-xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar">
        {messages.length === 0 && !selectedAgentId && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground hardtech-reveal">
            <div className="relative mb-4">
              <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-[#06b6d4]/40 to-violet-500/40 blur-xl animate-pulse" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-slate-900 shadow-xl">
                <Bot className="h-10 w-10 text-[#00F5FF]" />
              </div>
            </div>
            <p className="text-sm font-semibold text-foreground/80">Sélectionnez un agent</p>
            <p className="text-xs mt-1.5 text-center max-w-xs text-muted-foreground/70">
              Choisissez un agent dans le menu ci-dessus pour démarrer une conversation.
            </p>
            {agents.length === 0 && (
              <Button onClick={onOpenCreate} className="mt-5 gap-2 text-xs rounded-xl" variant="outline">
                <Plus className="h-3.5 w-3.5" />
                Créer un agent
              </Button>
            )}
          </div>
        )}
        {messages.length === 0 && selectedAgent && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground hardtech-reveal">
            <div className="relative mb-4">
              <div className={cn('absolute -inset-3 rounded-full blur-xl', isAgentActive ? 'bg-gradient-to-br from-[#06b6d4]/40 to-violet-500/40' : 'bg-muted/40')} />
              <div className={cn('relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-slate-900 shadow-xl', !isAgentActive && 'opacity-60')}>
                {selectedAgent.avatar ? (
                  <img src={selectedAgent.avatar} alt={selectedAgent.name} className="h-16 w-16 rounded-2xl object-cover" />
                ) : (
                  <Bot className={cn('h-8 w-8', isAgentActive ? 'text-[#00F5FF]' : 'text-muted-foreground')} />
                )}
              </div>
            </div>
            <p className="text-sm font-bold text-foreground/90">Conversation avec {selectedAgent.name}</p>
            <p className="text-xs mt-1.5 text-center max-w-xs text-muted-foreground/60 leading-relaxed">
              {selectedAgent.description || 'Envoyez un message ou choisissez une suggestion pour commencer.'}
            </p>
            {isAgentActive && (
              <div className="mt-7 flex flex-wrap justify-center gap-2 max-w-md">
                {PROMPT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    className="group flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full border border-border bg-white/[0.03] backdrop-blur hover:bg-[#06b6d4]/10 hover:border-[#06b6d4]/40 hover:text-[#06b6d4] hover:shadow-[0_0_16px_rgba(6,182,212,0.15)] transition-all duration-200"
                  >
                    <Sparkles className="h-3 w-3 opacity-50 group-hover:opacity-100 group-hover:text-[#06b6d4]" />
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {!isAgentActive && (
              <p className="text-xs text-amber-500 mt-4 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" /> Cet agent est inactif. Activez-le dans l'onglet « Mes Agents » pour discuter.
              </p>
            )}
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              <div className="flex gap-3 justify-end chat-msg-user-enter">
                <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-gradient-to-br from-[#06b6d4] to-[#0891b2] text-white rounded-tr-sm chat-msg-bubble shadow-lg shadow-[#06b6d4]/10 ring-1 ring-white/10">
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className="text-[10px] mt-1.5 text-white/40 flex items-center justify-end gap-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <CheckCircle2 className="h-2.5 w-2.5 text-white/30" />
                  </p>
                </div>
                <div className="relative flex-shrink-0 mt-0.5">
                  <div className="absolute -inset-[2px] rounded-full opacity-60 blur-sm bg-gradient-to-br from-[#06b6d4] to-[#0891b2]" />
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-slate-900 shadow-md shadow-[#06b6d4]/15">
                    <User className="h-4 w-4 text-white" />
                  </div>
                </div>
              </div>
            ) : (
              <div className={isTyping && idx === messages.length - 1 ? 'chat-msg-agent-enter' : ''}>
                <AgentResponse
                  content={msg.content}
                  agentName={selectedAgent?.name}
                  avatar={selectedAgent?.avatar}
                  timestamp={msg.timestamp.toISOString()}
                  isStreaming={isTyping && idx === messages.length - 1}
                />
              </div>
            )}
            {msg.role === 'agent' && idx > 0 && (
              <div className="mt-2 ml-11">
                <AdBanner
                  userPlan={userPlan}
                  placement="agent-response"
                  messageIndex={idx}
                  onAdViewed={() => trackAdEvent(`ad_response_${idx}`, 'view', userPlan)}
                  onAdClicked={() => trackAdEvent(`ad_response_${idx}`, 'click', userPlan)}
                />
              </div>
            )}
          </div>
        ))}

        {isTyping && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="flex gap-3 chat-typing-container">
            <div className="relative flex-shrink-0">
              <div className="absolute -inset-[2px] rounded-xl bg-gradient-to-br from-[#06b6d4] to-violet-500 opacity-60 blur-sm" />
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-slate-900">
                <Bot className="h-4 w-4 text-[#00F5FF]" />
              </div>
            </div>
            <div className="bg-muted/80 rounded-2xl rounded-tl-md border border-white/10 px-4 py-3.5 backdrop-blur-xl">
              <div className="flex items-center gap-1.5">
                <span className="typing-dot w-2 h-2 rounded-full bg-[#06b6d4]/60" />
                <span className="typing-dot w-2 h-2 rounded-full bg-[#06b6d4]/60" />
                <span className="typing-dot w-2 h-2 rounded-full bg-[#06b6d4]/60" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area with BorderBeam */}
      <div className="sticky bottom-0 p-4 bg-gradient-to-t from-background via-background/90 to-background/0 border-t border-border/40">
        <BorderBeam size="sm" colorVariant="colorful">
          <div className="flex items-end gap-2 rounded-2xl border border-border/70 bg-white/[0.03] backdrop-blur-2xl p-1.5 shadow-xl shadow-black/10 focus-within:border-[#06b6d4]/40 transition-all duration-300">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !selectedAgentId
                  ? "Sélectionnez d'abord un agent..."
                  : !isAgentActive
                    ? 'Cet agent est inactif'
                    : `Message à ${selectedAgent.name}...`
              }
              className="flex-1 min-h-[44px] max-h-32 rounded-xl bg-transparent px-3 py-2.5 text-sm resize-none focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 placeholder:text-muted-foreground/60"
              rows={1}
              disabled={!selectedAgentId || !isAgentActive || isTyping}
            />
            {isTyping ? (
              <button
                onClick={handleStop}
                className="h-[44px] w-[44px] rounded-xl bg-red-500 text-white hover:bg-red-600 flex items-center justify-center transition-all duration-200 shrink-0 shadow-lg shadow-red-500/20 hover:scale-105 active:scale-95"
                title="Arrêter la génération"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping || !selectedAgentId || !isAgentActive}
                className="chat-send-btn h-[44px] w-[44px] rounded-xl bg-gradient-to-br from-[#06b6d4] to-violet-500 text-white hover:from-[#06b6d4]/90 hover:to-violet-500/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0 shadow-lg shadow-[#06b6d4]/20 hover:scale-105 active:scale-95 disabled:hover:scale-100"
              >
                {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            )}
          </div>
        </BorderBeam>
        <div className="flex items-center justify-between mt-2 px-1">
          {selectedAgent && !isAgentActive ? (
            <p className="text-[10px] text-amber-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Cet agent est inactif. Activez-le pour discuter.
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground/50">
              Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
            </p>
          )}
          {isTyping && (
            <p className="text-[10px] text-[#06b6d4] font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3 animate-pulse" /> Génération en cours...
            </p>
          )}
        </div>
      </div>
    </div>
  );
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
        <TabsList className="w-full sm:w-auto rounded-xl bg-white/[0.03] border border-border/60 backdrop-blur-xl">
          <TabsTrigger value="agents" className="gap-1.5 rounded-lg">
            <Bot className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Mes Agents</span>
            <span className="sm:hidden">Agents</span>
            {agents.length > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-1 px-1.5">
                {agents.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5 rounded-lg">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Chat</span>
          </TabsTrigger>
          <TabsTrigger value="detail" className="gap-1.5 rounded-lg" disabled={!selectedAgentId}>
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
          <ChatTab agents={agents} onOpenCreate={() => handleOpenCreate()} />
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
