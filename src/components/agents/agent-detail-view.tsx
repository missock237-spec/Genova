'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
  Power,
  Edit,
  Trash2,
  User,
  Sparkles,
  FileText,
  Zap,
  Globe,
  Search,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { AgentResponse } from '@/components/shared/agent-response';
import {
  AVAILABLE_SKILLS,
  parseAgentConfig,
  getAgentSkills,
  type Agent,
} from './agents-view';

// ============================================================
// Types
// ============================================================

interface KnowledgeSource {
  id: string;
  type: 'url' | 'text';
  content: string;
  url?: string;
}

interface ChatMsg {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

// ============================================================
// Props
// ============================================================

interface AgentDetailViewProps {
  agentId: string;
  onBack: () => void;
  onEdit: (agent: Agent) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onRefresh: () => void;
}

// ============================================================
// Skill icon map
// ============================================================

const SKILL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  web_search: Search,
  code_generation: Bot,
  data_analysis: Zap,
  writing: Sparkles,
  translation: Globe,
  image_generation: Bot,
  email: FileText,
  document_analysis: FileText,
};

// ============================================================
// Component
// ============================================================

export function AgentDetailView({
  agentId,
  onBack,
  onEdit,
  onDelete,
  onToggle,
  onRefresh,
}: AgentDetailViewProps) {
  const { toast } = useToast();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // [rerender-7] Refs pour stabiliser handleSendMessage via useCallback
  const chatInputRef = useRef(chatInput);
  chatInputRef.current = chatInput;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // Fetch agent data
  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    apiFetch<Agent>(`/api/agents/${agentId}`)
      .then((data) => {
        if (data && typeof data === 'object' && 'id' in data) {
          setAgent(data as Agent);
        } else {
          setError('Données invalides reçues du serveur');
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Impossible de charger l\'agent');
      })
      .finally(() => setLoading(false));
  }, [agentId]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Parse agent config
  const config = agent ? parseAgentConfig(agent.config) : {};
  const agentSkills = agent ? getAgentSkills(agent) : [];
  const knowledge: KnowledgeSource[] = Array.isArray(config.knowledge)
    ? (config.knowledge as KnowledgeSource[])
    : [];
  const knowledgeText: string = typeof config.knowledge === 'string' ? (config.knowledge as string) : '';
  const model = (config.model as string) || 'default';
  const temperature = typeof config.temperature === 'number' ? (config.temperature as number) : 0.7;
  const isActive = agent?.status === 'active';

  // [rerender-7] Stabilisé avec useCallback + refs — même pattern que chat-panel/agents-view
  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputRef.current.trim() || isStreamingRef.current || !agentId || !isActiveRef.current) return;

    const userMsg: ChatMsg = {
      role: 'user',
      content: chatInputRef.current.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    const sentText = chatInputRef.current.trim();
    setChatInput('');
    setIsStreaming(true);

    const agentMsgId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      { id: agentMsgId, role: 'agent', content: '', timestamp: new Date().toISOString() },
    ]);

    try {
      const response = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: sentText }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Erreur réseau' }));
        throw new Error(errData.error || `Erreur ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let fullContent = '';
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
                  } else if (parsed.content) {
                    fullContent = parsed.content;
                  }
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg && lastMsg.role === 'agent') {
                      updated[updated.length - 1] = { ...lastMsg, content: fullContent };
                    }
                    return updated;
                  });
                } catch {
                  // Skip invalid JSON
                }
              }
            }
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
        const data = await response.json();
        setMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.role === 'agent') {
            updated[updated.length - 1] = {
              ...lastMsg,
              content: data.response || data.content || 'Réponse reçue.',
            };
          }
          return updated;
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Erreur de communication';
      setMessages((prev) => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'agent') {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: `Désolé, une erreur est survenue : ${errMsg}. Veuillez réessayer.`,
          };
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [agentId]);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#06b6d4] mb-3" />
        <p className="text-sm text-muted-foreground">Chargement des détails de l'agent...</p>
      </div>
    );
  }

  // Error state
  if (error || !agent) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <p className="text-sm font-medium">Erreur de chargement</p>
        <p className="text-xs text-muted-foreground mb-4">{error || 'Agent introuvable'}</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={`p-2.5 rounded-xl ${
              isActive ? 'bg-[#06b6d4]/10' : 'bg-muted'
            } flex-shrink-0`}
          >
            <Bot
              className={`h-5 w-5 ${
                isActive ? 'text-[#06b6d4]' : 'text-muted-foreground'
              }`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold truncate">{agent.name}</h2>
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
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {agent.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={() => onEdit(agent)}
          >
            <Edit className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Modifier</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 rounded-xl ${!isActive ? 'text-[#06b6d4]' : ''}`}
            onClick={() => onToggle(agent.id)}
          >
            <Power className={`h-3.5 w-3.5 ${!isActive ? 'text-[#06b6d4]' : ''}`} />
            <span className="hidden sm:inline">{isActive ? 'Désactiver' : 'Activer'}</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-destructive/70 hover:text-destructive rounded-xl"
            onClick={() => onDelete(agent.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Skills panel */}
      <Card className="border-border/50 rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#06b6d4]" />
            Compétences ({agentSkills.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agentSkills.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Aucune compétence assignée</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 rounded-xl"
                onClick={() => onEdit(agent)}
              >
                <Edit className="h-3.5 w-3.5 mr-1" />
                Configurer
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {agentSkills.map((skillId) => {
                const skill = AVAILABLE_SKILLS.find((s) => s.id === skillId);
                if (!skill) return null;
                const SkillIcon = SKILL_ICONS[skill.id] || Bot;
                return (
                  <Badge
                    key={skill.id}
                    variant="outline"
                    className={`${skill.bgColor} ${skill.color} border-current/20 py-1.5 px-3 rounded-xl gap-1.5 text-xs font-medium`
                    }
                  >
                    <SkillIcon className="h-3 w-3" />
                    {skill.label}
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Knowledge sources panel */}
      <Card className="border-border/50 rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#06b6d4]" />
            Sources de connaissances
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Array-based knowledge sources */}
          {knowledge.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {knowledge.map((source, idx) => (
                <div
                  key={source.id || idx}
                  className="flex items-start gap-3 p-3 rounded-xl border border-border/50"
                >
                  <div
                    className={`p-1.5 rounded-lg flex-shrink-0 ${
                      source.type === 'url' ? 'bg-sky-500/10' : 'bg-amber-500/10'
                    }`}
                  >
                    {source.type === 'url' ? (
                      <Globe className="h-3.5 w-3.5 text-sky-500" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">
                      {source.type === 'url'
                        ? source.url || source.content
                        : 'Note texte'}
                    </p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                      {source.type === 'url'
                        ? source.content
                        : source.content.substring(0, 150) +
                          (source.content.length > 150 ? '...' : '')}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[9px] flex-shrink-0 rounded-lg"
                  >
                    {source.type === 'url' ? 'URL' : 'Texte'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : null}

          {/* String-based knowledge */}
          {knowledgeText && (
            <div className="mt-2">
              <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                <p className="text-xs text-foreground/80 whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {knowledgeText}
                </p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {knowledge.length === 0 && !knowledgeText && (
            <div className="text-center py-6 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Aucune source de connaissance</p>
              <p className="text-[10px] mt-1">
                Ajoutez des connaissances via le formulaire de modification
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model info bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5" />
          <span>
            {model === 'default'
              ? 'Modèle automatique'
              : model.split('/').pop()}
          </span>
        </div>
        <Separator orientation="vertical" className="h-3" />
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Température : {temperature.toFixed(1)}</span>
        </div>
      </div>

      {/* Chat interface */}
      <Card className="border-border/50 rounded-xl h-[500px] flex flex-col">
        <CardHeader className="pb-2 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4 text-[#06b6d4]" />
            Conversation avec {agent.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-0 min-h-0">
          <ScrollArea className="flex-1 px-4 py-2 max-h-[400px]">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="p-3 rounded-2xl bg-[#06b6d4]/10 mx-auto w-fit mb-3">
                    <Bot className="h-10 w-10 text-[#06b6d4]/60" />
                  </div>
                  <p className="text-sm">
                    Commencez une conversation avec {agent.name}
                  </p>
                  <p className="text-xs mt-1">
                    L&apos;agent répondra en fonction de ses compétences et instructions
                  </p>
                  {!isActive && (
                    <p className="text-xs text-amber-500 mt-2">
                      L&apos;agent est inactif. Activez-le pour discuter.
                    </p>
                  )}
                </div>
              )}

              {messages.map((msg, idx) => (
                <div key={idx}>
                  {msg.role === 'user' ? (
                    <div className="flex gap-3 justify-end">
                      <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-[#06b6d4] text-white rounded-tr-sm">
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        <p className="text-[10px] mt-1 text-white/50">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-[#06b6d4] flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  ) : (
                    <AgentResponse
                      content={msg.content}
                      agentName={agent.name}
                      avatar={agent.avatar}
                      timestamp={msg.timestamp}
                      isStreaming={isStreaming && idx === messages.length - 1}
                    />
                  )}
                </div>
              ))}

              {isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#06b6d4]/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-[#06b6d4]" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <span
                        className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-border/50">
            <form
              onSubmit={handleSendMessage}
              className="flex gap-2"
            >
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                placeholder={`Envoyer un message à ${agent.name}...`}
                disabled={isStreaming || !isActive}
                className="flex-1 min-h-[44px] max-h-32 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06b6d4]"
                rows={1}
              />
              <button
                type="submit"
                disabled={isStreaming || !chatInput.trim() || !isActive}
                className="h-[44px] w-[44px] rounded-xl bg-[#06b6d4] text-white hover:bg-[#06b6d4]/90 disabled:opacity-50 flex items-center justify-center transition-colors"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
