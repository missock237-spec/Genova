'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot,
  User,
  Send,
  Square,
  MessageSquare,
  Plus,
  Trash2,
  ChevronLeft,
  Loader2,
  AlertCircle,
  X,
  Sparkles,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
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
import { AdBanner } from '@/components/shared/ad-banner';
import { AgentResponse } from '@/components/shared/agent-response';
import { BorderBeam } from '@/components/ui/border-beam';
import { useAdContext } from '@/components/shared/ad-context';
import { useAuthStore } from '@/lib/store';
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
  config?: string;
  avatar?: string;
  _count?: Record<string, number>;
  permissions?: Record<string, unknown>[];
}

export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

export interface ConversationSummary {
  id: string;
  title: string;
  agentId: string;
  agentName: string | null;
  createdAt: unknown;
  updatedAt: unknown;
  lastMessage: {
    content: string;
    role: string;
    createdAt: unknown;
  } | null;
  messageCount: number;
}

interface ChatPanelProps {
  agents: Agent[];
  onOpenCreate?: () => void;
}

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
// ChatPanel — Composant unifié avec sidebar conversations
// ============================================================

export function ChatPanel({ agents, onOpenCreate }: ChatPanelProps) {
  const { user } = useAuthStore();
  const { incMessageCount, trackAdEvent, creditBalance, lastRewardMessage, rewardStats } = useAdContext();
  const { toast } = useToast();

  // --- State: Chat ---
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  // --- State: Sidebar ---
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);

  const userPlan = user?.plan || 'free';
  const isPaid = userPlan !== 'free';
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const isAgentActive = selectedAgent?.status === 'active';
  const activeAgents = agents.filter((a) => a.status === 'active');
  const inactiveAgents = agents.filter((a) => a.status !== 'active');
  const remainingToday = rewardStats.maxPerDay - rewardStats.balance.today;

  // ============================================================
  // Auto-select first active agent
  // ============================================================

  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      const firstActive = agents.find((a) => a.status === 'active');
      if (firstActive) setSelectedAgentId(firstActive.id);
      else setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  // ============================================================
  // Reset messages on agent change
  // ============================================================

  useEffect(() => {
    setMessages([]);
    setError(null);
    conversationIdRef.current = null;
  }, [selectedAgentId]);

  // ============================================================
  // Auto-scroll
  // ============================================================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ============================================================
  // Auto-resize textarea
  // ============================================================

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 128) + 'px';
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // ============================================================
  // Charger les conversations
  // ============================================================

  const fetchConversations = useCallback(async (agentFilter?: string) => {
    setLoadingConv(true);
    try {
      const params = new URLSearchParams();
      if (agentFilter) params.set('agentId', agentFilter);
      params.set('limit', '30');

      const res = await fetch(`/api/conversations?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      // Silently fail — conversations list is non-critical
    } finally {
      setLoadingConv(false);
    }
  }, []);

  // Charger les conversations au montage et quand l'agent change
  useEffect(() => {
    fetchConversations(selectedAgentId || undefined);
  }, [selectedAgentId, fetchConversations]);

  // ============================================================
  // Charger les messages d'une conversation
  // ============================================================

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      conversationIdRef.current = convId;

      // Mapper vers le format Message local
      const loaded: Message[] = (data.messages || []).map((m: { id: string; role: string; content: string; createdAt: unknown }) => ({
        id: m.id,
        role: m.role === 'assistant' ? 'agent' as const : 'user' as const,
        content: m.content,
        timestamp: normalizeTimestamp(m.createdAt),
      }));
      setMessages(loaded);
      setSidebarOpen(false);

      // Sélectionner l'agent de la conversation si différent
      if (data.conversation?.agentId && data.conversation.agentId !== selectedAgentId) {
        setSelectedAgentId(data.conversation.agentId);
      }
    } catch {
      // Silently fail
    }
  }, [selectedAgentId]);

  // ============================================================
  // Supprimer une conversation
  // ============================================================

  const deleteConversation = useCallback(async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) return;
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      // Si c'était la conversation courante, réinitialiser
      if (conversationIdRef.current === convId) {
        setMessages([]);
        conversationIdRef.current = null;
      }
      toast({ title: 'Conversation supprimée', description: 'La conversation a été supprimée.' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de supprimer la conversation', variant: 'destructive' });
    }
  }, [toast]);

  // ============================================================
  // Nouvelle conversation
  // ============================================================

  const newConversation = useCallback(() => {
    setMessages([]);
    conversationIdRef.current = null;
    setError(null);
    setSidebarOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  // ============================================================
  // Stop generation
  // ============================================================

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsTyping(false);
  }, []);

  // ============================================================
  // Envoyer un message
  // ============================================================

  const handleSend = async (overrideText?: string) => {
    const text = overrideText || input;
    if (!text.trim() || isTyping || !selectedAgentId) return;

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

    // Re-focus textarea
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
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
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

      // Récupérer le conversation ID depuis les headers
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
                    // Skip invalid JSON
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
                updated[updated.length - 1] = { ...lastMsg, content: "L'agent a traité votre demande." };
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

      // Rafraîchir la liste des conversations après l'envoi
      fetchConversations(selectedAgentId || undefined);
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

  // ============================================================
  // Keyboard
  // ============================================================

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ============================================================
  // Format date relative
  // ============================================================

  const formatDate = (date: unknown) => {
    const d = normalizeTimestamp(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'À l\'instant';
    if (diffMin < 60) return `Il y a ${diffMin}min`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `Il y a ${diffHrs}h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex h-[calc(100vh-16rem)] relative overflow-hidden">
      {/* ============================================ */}
      {/* Sidebar overlay (mobile) */}
      {/* ============================================ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ============================================ */}
      {/* Sidebar — Conversations */}
      {/* ============================================ */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-72 bg-background border-r border-border
          transform transition-transform duration-200 ease-in-out
          lg:relative lg:transform-none lg:z-auto lg:w-64 xl:w-72
          flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-border">
          <span className="text-sm font-semibold">Conversations</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={newConversation}
              title="Nouvelle conversation"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingConv && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {conversations.length === 0 && !loadingConv && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              Aucune conversation
            </div>
          )}

          {conversations.map((conv) => {
            const isActive = conversationIdRef.current === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`
                  group flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b border-border/50
                  hover:bg-muted/50 transition-colors
                  ${isActive ? 'bg-[#06b6d4]/5 border-l-2 border-l-[#06b6d4]' : ''}
                `}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-medium truncate">{conv.title || 'Sans titre'}</span>
                  </div>
                  {conv.lastMessage && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate pl-5">
                      {conv.lastMessage.content}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 pl-5">
                    <span className="text-[10px] text-muted-foreground/60">{formatDate(conv.createdAt)}</span>
                    {conv.messageCount > 0 && (
                      <span className="text-[10px] text-muted-foreground/60">{conv.messageCount} msg</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded hover:bg-red-500/10 hover:text-red-500 transition-all"
                  title="Supprimer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ============================================ */}
      {/* Main chat area */}
      {/* ============================================ */}
      <div className="flex-1 flex flex-col min-w-0">
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
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>

          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isAgentActive ? 'bg-[#06b6d4]/10' : 'bg-muted'}`}>
            <Bot className={`h-4 w-4 ${isAgentActive ? 'text-[#06b6d4]' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="h-8 border-0 shadow-none p-0 font-medium text-sm">
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
              className={`text-[10px] whitespace-nowrap ${
                isAgentActive
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {isAgentActive ? 'Actif' : 'Inactif'}
            </Badge>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <Alert variant="destructive" className="mx-4 mt-2 py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Empty state — no agent */}
          {messages.length === 0 && !selectedAgentId && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="p-3 rounded-2xl bg-[#06b6d4]/10 mb-3 animate-pulse">
                <Bot className="h-10 w-10 text-[#06b6d4]/60" />
              </div>
              <p className="text-sm font-medium">Sélectionnez un agent</p>
              <p className="text-xs mt-1 text-center max-w-xs">
                Choisissez un agent dans le menu ci-dessus pour démarrer une conversation.
              </p>
              {agents.length === 0 && onOpenCreate && (
                <Button onClick={onOpenCreate} className="mt-4 gap-2 text-xs" variant="outline">
                  <Plus className="h-3.5 w-3.5" />
                  Créer un agent
                </Button>
              )}
              <div className="mt-4 flex items-center gap-1 text-[10px] text-muted-foreground/60">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#06b6d4]/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#06b6d4]/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#06b6d4]/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {/* Empty state — agent selected, no messages */}
          {messages.length === 0 && selectedAgent && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className={`p-3 rounded-2xl mb-3 ${isAgentActive ? 'bg-[#06b6d4]/10' : 'bg-muted'}`}>
                <Bot className={`h-10 w-10 ${isAgentActive ? 'text-[#06b6d4]/60' : 'text-muted-foreground/40'}`} />
              </div>
              <p className="text-sm font-medium">{selectedAgent.name}</p>
              <p className="text-xs mt-1 text-muted-foreground max-w-xs">
                {selectedAgent.description || 'Envoyez un message ou choisissez une suggestion.'}
              </p>
              {isAgentActive && (
                <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-sm">
                  {PROMPT_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSend(suggestion)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:bg-[#06b6d4]/5 hover:border-[#06b6d4]/30 hover:text-[#06b6d4] transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              {!isAgentActive && (
                <p className="text-xs text-amber-500 mt-3">
                  Cet agent est inactif. Activez-le dans l'onglet « Mes Agents » pour discuter.
                </p>
              )}
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, idx) => (
            <div key={msg.id}>
              {msg.role === 'user' ? (
                <div className="flex gap-3 justify-end">
                  <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-[#06b6d4] text-white rounded-tr-sm">
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className="text-[10px] mt-1 text-white/50">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#06b6d4] flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-white" />
                  </div>
                </div>
              ) : (
                <AgentResponse
                  content={msg.content}
                  agentName={selectedAgent?.name}
                  avatar={selectedAgent?.avatar}
                  timestamp={msg.timestamp.toISOString()}
                  isStreaming={isTyping && idx === messages.length - 1}
                />
              )}
              {msg.role === 'agent' && idx > 0 && (
                <div className="mt-2">
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

          {/* Typing indicator */}
          {isTyping && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#06b6d4]/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-[#06b6d4]" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{selectedAgent?.name || 'Agent'} écrit...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="sticky bottom-0 bg-background/80 backdrop-blur-sm border-t border-border p-3 sm:p-4">
          <BorderBeam size="sm" colorVariant="colorful">
            <div className="flex gap-2 rounded-xl border bg-background p-1">
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
                className="flex-1 min-h-[44px] max-h-32 rounded-lg bg-transparent px-3 py-2.5 text-sm resize-none focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                rows={1}
                disabled={!selectedAgentId || !isAgentActive || isTyping}
              />
              {isTyping ? (
                <button
                  onClick={handleStop}
                  className="h-[44px] w-[44px] rounded-lg bg-red-500 text-white hover:bg-red-600 flex items-center justify-center transition-all duration-200 shrink-0"
                  title="Arrêter la génération"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || !selectedAgentId || !isAgentActive}
                  className="h-[44px] w-[44px] rounded-lg bg-[#06b6d4] text-white hover:bg-[#06b6d4]/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 shrink-0"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </BorderBeam>
          <div className="flex items-center justify-between mt-1.5 px-1">
            {selectedAgent && !isAgentActive ? (
              <p className="text-[10px] text-amber-500">Cet agent est inactif. Activez-le pour discuter.</p>
            ) : (
              <p className="text-[10px] text-muted-foreground/50">
                Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
              </p>
            )}
            {isTyping && (
              <p className="text-[10px] text-[#06b6d4] font-medium">Génération en cours...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function normalizeTimestamp(date: unknown): Date {
  if (date instanceof Date) return date;
  if (typeof date === 'string') {
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  if (date && typeof date === 'object' && '_seconds' in (date as object)) {
    // Firestore Timestamp
    return new Date((date as { _seconds: number; _nanoseconds?: number })._seconds * 1000);
  }
  return new Date();
}
