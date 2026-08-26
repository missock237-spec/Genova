'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Paperclip,
  Brain,
  Grid3X3,
  Image as ImageIcon,
  FileText,
  Video,
  Upload,
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
import { cn } from '@/lib/utils';
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

export interface ChatAttachment {
  id: string;
  file: File;
  url: string | null;
  preview: string | null;
  status: 'uploading' | 'ready' | 'error';
  category: 'image' | 'video' | 'document' | 'other';
}

export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  attachments?: { url: string; filename: string; mimeType: string; category: string }[];
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
  onBack?: () => void;
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

export function ChatPanel({ agents, onOpenCreate, onBack }: ChatPanelProps) {
  const { user } = useAuthStore();
  const { incMessageCount, trackAdEvent, creditBalance, lastRewardMessage, rewardStats } = useAdContext();
  const { toast } = useToast();

  // --- State: Chat ---
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- State: Attachments ---
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- State: Reflection Mode ---
  const [reflectionMode, setReflectionMode] = useState(false);

  // --- State: Features Panel ---
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [features, setFeatures] = useState<Array<{ id: string; name: string; description: string; status: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  // [rerender-4] Refs pour les valeurs mutables utilisées dans handleSend
  // afin de stabiliser la référence de handleSend via useCallback
  const inputRef = useRef(input);
  inputRef.current = input;
  const isTypingRef = useRef(isTyping);
  isTypingRef.current = isTyping;
  const selectedAgentIdRef = useRef(selectedAgentId);
  selectedAgentIdRef.current = selectedAgentId;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const reflectionModeRef = useRef(reflectionMode);
  reflectionModeRef.current = reflectionMode;

  // --- State: Sidebar ---
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);

  const userPlan = user?.plan || 'free';
  const isPaid = userPlan !== 'free';
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const isAgentActive = selectedAgent?.status === 'active';
  // [rerender-5] Memoïsé — évite de recréer 2 nouvelles références de tableau à chaque render
  const activeAgents = useMemo(() => agents.filter((a) => a.status === 'active'), [agents]);
  const inactiveAgents = useMemo(() => agents.filter((a) => a.status !== 'active'), [agents]);
  const remainingToday = rewardStats.maxPerDay - rewardStats.balance.today;

  // ============================================================
  // Fetch features (for functions panel)
  // ============================================================
  useEffect(() => {
    fetch('/api/health/features')
      .then((r) => r.json())
      .then((data) => {
        if (data.operational) setFeatures(data.operational);
      })
      .catch(() => {});
  }, []);

  // ============================================================
  // File upload handler
  // ============================================================
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newAttachments: ChatAttachment[] = files.map((file) => {
      const cat = file.type.startsWith('image/') ? 'image' as const
        : file.type.startsWith('video/') ? 'video' as const
        : file.type.includes('pdf') || file.type.includes('document') || file.type.includes('text') ? 'document' as const
        : 'other' as const;

      let preview: string | null = null;
      if (cat === 'image') {
        preview = URL.createObjectURL(file);
      }

      return {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: null,
        preview,
        status: 'uploading' as const,
        category: cat,
      };
    });

    setAttachments((prev) => [...prev, ...newAttachments]);
    setIsUploading(true);

    // Upload all files
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));

    try {
      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();

      if (data.files && Array.isArray(data.files)) {
        type UploadedFile = { filename: string; url: string; mimeType: string; category: string };
        const urlMap = new Map<string, UploadedFile>(data.files.map((f: UploadedFile) => [f.filename, f]));
        setAttachments((prev) =>
          prev.map((att) => {
            const uploaded = urlMap.get(att.file.name);
            if (uploaded) {
              return { ...att, url: uploaded.url, status: 'ready' as const, category: (uploaded.category || att.category) as ChatAttachment['category'] };
            }
            return att;
          })
        );
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch {
      setAttachments((prev) =>
        prev.map((att) =>
          att.status === 'uploading' ? { ...att, status: 'error' as const } : att
        )
      );
      toast({ title: 'Erreur upload', description: 'Impossible de téléverser le(s) fichier(s)', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [toast]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}Mo`;
  };

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

  // [rerender-4] handleSend stabilisé avec useCallback + refs pour les valeurs mutables.
  // Évite de recréer la fonction à chaque keystroke (input) ou chaque streaming tick (messages).
  const handleSend = useCallback(async (overrideText?: string) => {
    const text = overrideText || inputRef.current;
    if ((!text.trim() && attachmentsRef.current.length === 0) || isTypingRef.current || !selectedAgentIdRef.current) return;

    // Build message with attachment references
    let content = text.trim();
    const currentAttachments = attachmentsRef.current.filter((a) => a.status === 'ready');
    if (currentAttachments.length > 0) {
      const fileRefs = currentAttachments
        .map((a) => {
          const catLabel = a.category === 'image' ? 'Image' : a.category === 'video' ? 'Vidéo' : 'Document';
          return `[${catLabel}: ${a.file.name}]`;
        })
        .join('\n');
      content = content ? `${content}\n\n${fileRefs}` : fileRefs;
    }

    // Reflection mode: prepend thinking instruction
    if (reflectionModeRef.current && content) {
      content = `[Mode Réflexion activé] Réfléchis étape par étape avant de répondre. Montre ton raisonnement.\n\n${content}`;
    }

    if (!content) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
      attachments: currentAttachments.map((a) => ({
        url: a.url || '',
        filename: a.file.name,
        mimeType: a.file.type,
        category: a.category,
      })),
    };

    setMessages((prev) => [...prev, userMsg]);
    const sentText = content;
    setInput('');
    setAttachments([]);
    setIsTyping(true);
    setError(null);
    incMessageCount();

    // Re-focus textarea
    requestAnimationFrame(() => textareaRef.current?.focus());

    // Historique pour le backend (12 derniers messages)
    const historyForBackend = [...messagesRef.current, userMsg].slice(-12).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/agents/${selectedAgentIdRef.current}/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: sentText,
          history: historyForBackend,
          conversationId: conversationIdRef.current || undefined,
          attachments: userMsg.attachments,
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
      fetchConversations(selectedAgentIdRef.current || undefined);
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
  }, []); // deps vides : toutes les valeurs mutables passent par refs

  // [rerender-3] Callbacks de tracking pub stabilisés pour éviter re-rendus AdBanner pendant le streaming
  const adHandlers = useMemo(() => {
    const map = new Map<number, { onAdViewed: () => void; onAdClicked: () => void }>();
    return (idx: number) => {
      if (!map.has(idx)) {
        map.set(idx, {
          onAdViewed: () => trackAdEvent(`ad_response_${idx}`, 'view', userPlan),
          onAdClicked: () => trackAdEvent(`ad_response_${idx}`, 'click', userPlan),
        });
      }
      return map.get(idx)!;
    };
  }, [trackAdEvent, userPlan]);

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
    if (diffMin < 1) return "À l'instant";
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
    <div className="flex h-[calc(100vh-16rem)] relative overflow-hidden rounded-3xl border border-border/60 bg-background shadow-2xl shadow-black/20">
      {/* ============================================ */}
      {/* Sidebar overlay (mobile) */}
      {/* ============================================ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ============================================ */}
      {/* Sidebar — Conversations */}
      {/* ============================================ */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-80 bg-card/95 backdrop-blur-xl border-r border-border',
          'transform transition-all duration-300 ease-in-out',
          'lg:relative lg:transform-none lg:z-auto lg:w-72 xl:w-80',
          'flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/60 bg-gradient-to-r from-[#06b6d4]/10 to-violet-500/5">
          <span className="text-sm font-bold tracking-tight">Conversations</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl hover:bg-[#06b6d4]/10 hover:text-[#06b6d4]"
              onClick={newConversation}
              title="Nouvelle conversation"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loadingConv && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-4 w-4 animate-spin text-[#06b6d4]" />
            </div>
          )}

          {conversations.length === 0 && !loadingConv && (
            <div className="px-4 py-12 text-center text-xs text-muted-foreground">
              <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-30" />
              Aucune conversation
            </div>
          )}

          {conversations.map((conv) => {
            const isActive = conversationIdRef.current === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={cn(
                  'group relative flex items-start gap-2 px-4 py-3 cursor-pointer transition-all duration-200',
                  isActive
                    ? 'bg-[#06b6d4]/10'
                    : 'hover:bg-muted/60',
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full bg-gradient-to-b from-[#06b6d4] to-violet-500" />
                )}
                <div className={cn('mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border', isActive ? 'border-[#06b6d4]/30 bg-[#06b6d4]/10 text-[#06b6d4]' : 'border-border bg-muted text-muted-foreground')}>
                  <MessageSquare className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className={cn('text-xs font-medium truncate block', isActive ? 'text-[#06b6d4]' : 'text-foreground/90')}>
                    {conv.title || 'Sans titre'}
                  </span>
                  {conv.lastMessage && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {conv.lastMessage.content}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-muted-foreground/60">{formatDate(conv.createdAt)}</span>
                    {conv.messageCount > 0 && (
                      <span className="text-[9px] text-muted-foreground/60">{conv.messageCount} msg</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-all"
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
      <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-b from-background to-background/80">
        {/* Ad credit bar */}
        {isPaid && (
          <div className="flex items-center justify-between px-4 py-2 border-b bg-gradient-to-r from-emerald-500/5 to-green-500/5 backdrop-blur">
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
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-[#06b6d4]/10 hover:text-[#06b6d4]"
              onClick={onBack}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl hover:bg-[#06b6d4]/10 hover:text-[#06b6d4] lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>

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
            <span
              className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background', isAgentActive ? 'bg-emerald-400' : 'bg-muted-foreground/40')}
            />
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
          {/* Empty state — no agent */}
          {messages.length === 0 && !selectedAgentId && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="relative mb-5">
                <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-[#06b6d4]/40 to-violet-500/40 blur-xl animate-pulse" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-slate-900 shadow-xl">
                  <Bot className="h-10 w-10 text-[#00F5FF]" />
                </div>
              </div>
              <p className="text-sm font-semibold text-foreground/90">Sélectionnez un agent</p>
              <p className="text-xs mt-1.5 text-center max-w-xs text-muted-foreground/70">
                Choisissez un agent dans le menu ci-dessus pour démarrer une conversation.
              </p>
              {agents.length === 0 && onOpenCreate && (
                <Button onClick={onOpenCreate} className="mt-5 gap-2 text-xs rounded-xl" variant="outline">
                  <Plus className="h-3.5 w-3.5" />
                  Créer un agent
                </Button>
              )}
            </div>
          )}

          {/* Empty state — agent selected, no messages */}
          {messages.length === 0 && selectedAgent && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="relative mb-5">
                <div className={cn('absolute -inset-3 rounded-full blur-xl', isAgentActive ? 'bg-gradient-to-br from-[#06b6d4]/40 to-violet-500/40' : 'bg-muted/40')} />
                <div className={cn('relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-slate-900 shadow-xl', !isAgentActive && 'opacity-60')}>
                  {selectedAgent.avatar ? (
                    <img src={selectedAgent.avatar} alt={selectedAgent.name} className="h-16 w-16 rounded-2xl object-cover" />
                  ) : (
                    <Bot className={cn('h-8 w-8', isAgentActive ? 'text-[#00F5FF]' : 'text-muted-foreground')} />
                  )}
                </div>
              </div>
              <p className="text-sm font-bold text-foreground/95">{selectedAgent.name}</p>
              <p className="text-xs mt-1.5 text-muted-foreground max-w-sm">
                {selectedAgent.description || 'Envoyez un message ou choisissez une suggestion.'}
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

          {/* Messages */}
          {messages.map((msg, idx) => (
            <div key={msg.id}>
              {msg.role === 'user' ? (
                <div className="flex gap-3 justify-end chat-msg-user-enter">
                  <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-gradient-to-br from-[#06b6d4] to-[#0891b2] text-white rounded-tr-sm shadow-lg shadow-[#06b6d4]/15 ring-1 ring-white/10">
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex gap-1.5 mb-2 flex-wrap">
                        {msg.attachments.map((att, i) => (
                          <div key={i} className="rounded-lg bg-white/10 px-2 py-1 flex items-center gap-1 text-[10px]">
                            {att.category === 'image' ? <ImageIcon className="h-3 w-3" /> :
                             att.category === 'video' ? <Video className="h-3 w-3" /> :
                             <FileText className="h-3 w-3" />}
                            <span className="truncate max-w-[120px]">{att.filename}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className="text-[10px] mt-1.5 text-white/50 flex items-center justify-end gap-1">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      <CheckCircle2 className="h-2.5 w-2.5 text-white/40" />
                    </p>
                  </div>
                  <div className="relative flex-shrink-0 mt-0.5">
                    <div className="absolute -inset-[2px] rounded-full opacity-60 blur-sm bg-gradient-to-br from-[#06b6d4] to-[#0891b2]" />
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-slate-900">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className={cn(isTyping && idx === messages.length - 1 ? 'chat-msg-agent-enter' : '')}>
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
                    {...adHandlers(idx)}
                  />
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
            <div className="flex gap-3 chat-typing-container">
              <div className="relative flex-shrink-0">
                <div className="absolute -inset-[2px] rounded-xl bg-gradient-to-br from-[#06b6d4] to-violet-500 opacity-60 blur-sm" />
                <div className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-white/20 bg-slate-900">
                  <Bot className="h-4 w-4 text-[#00F5FF]" />
                </div>
              </div>
              <div className="bg-muted/50 rounded-2xl rounded-tl-md border border-white/10 px-4 py-3.5 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#06b6d4]/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[#06b6d4]/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[#06b6d4]/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground ml-1">{selectedAgent?.name || 'Agent'} écrit...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Features panel (rectangle zone — above input) */}
        {featuresOpen && (
          <div className="mx-3 sm:mx-4 mb-2 rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl p-3 animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-foreground/90 flex items-center gap-1.5">
                <Grid3X3 className="h-3.5 w-3.5 text-[#06b6d4]" />
                Fonctions du projet
              </h3>
              <button
                onClick={() => setFeaturesOpen(false)}
                className="h-6 w-6 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
              {features.filter((f) => f.status === 'prod' || f.status === 'beta' || f.status === 'active').map((feature) => (
                <button
                  key={feature.id}
                  onClick={() => {
                    setInput((prev) => prev ? `${prev} [${feature.name}]` : `[${feature.name}] `);
                    setFeaturesOpen(false);
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                  className="group flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-xl border border-border/50 bg-white/[0.02] hover:bg-[#06b6d4]/5 hover:border-[#06b6d4]/30 transition-all duration-200 text-left"
                >
                  <span className="text-[11px] font-semibold text-foreground/90 group-hover:text-[#06b6d4] transition-colors">
                    {feature.name}
                  </span>
                  <span className="text-[9px] text-muted-foreground/70 line-clamp-2 leading-tight">
                    {feature.description}
                  </span>
                  <span className={cn(
                    'text-[8px] mt-0.5 font-medium px-1.5 py-0 rounded-full w-fit',
                    feature.status === 'prod' ? 'bg-emerald-500/10 text-emerald-500' :
                    feature.status === 'active' ? 'bg-blue-500/10 text-blue-400' :
                    'bg-amber-500/10 text-amber-500'
                  )}>
                    {feature.status === 'prod' ? 'Actif' : feature.status === 'active' ? 'Disponible' : 'Bêta'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input area — frosted glass composer */}
        <div className="sticky bottom-0 bg-gradient-to-t from-background via-background/90 to-background/0 backdrop-blur border-t border-border/40 p-3 sm:p-4 pt-4">
          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="flex gap-2 mb-2 px-1 overflow-x-auto custom-scrollbar pb-1">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className={cn(
                    'relative flex-shrink-0 group rounded-xl border border-border/60 bg-white/[0.03] overflow-hidden transition-all',
                    att.status === 'error' && 'border-red-500/40',
                  )}
                >
                  {att.category === 'image' && att.preview ? (
                    <div className="relative w-16 h-16">
                      <img src={att.preview} alt={att.file.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 flex flex-col items-center justify-center gap-1 p-1.5">
                      {att.category === 'video' ? (
                        <Video className="h-5 w-5 text-violet-400" />
                      ) : (
                        <FileText className="h-5 w-5 text-[#06b6d4]" />
                      )}
                      <span className="text-[8px] text-muted-foreground truncate max-w-[52px]">{att.file.name}</span>
                      <span className="text-[7px] text-muted-foreground/60">{formatFileSize(att.file.size)}</span>
                    </div>
                  )}
                  {att.status === 'uploading' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  )}
                  {att.status === 'error' && (
                    <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
                      <AlertCircle className="h-4 w-4 text-red-400" />
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <div className="pointer-events-none absolute -inset-x-1 -top-1 bottom-0 rounded-full bg-gradient-to-r from-[#06b6d4]/10 via-violet-500/10 to-[#06b6d4]/10 blur-2xl opacity-70" />
            <div className="relative flex items-end gap-2 rounded-2xl border border-border/70 bg-white/[0.03] backdrop-blur-2xl p-2 shadow-xl shadow-black/10 focus-within:border-[#06b6d4]/40 focus-within:shadow-[0_0_24px_rgba(6,182,212,0.12)] transition-all duration-300">
              {/* Upload button (Plus / Paperclip) */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isTyping}
                className="h-[44px] w-[44px] rounded-xl flex items-center justify-center text-muted-foreground hover:text-[#06b6d4] hover:bg-[#06b6d4]/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shrink-0"
                title="Téléverser images, vidéos, fichiers"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>
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
                className="flex-1 min-h-[44px] max-h-32 rounded-xl bg-transparent px-3 py-2.5 text-sm resize-none focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-muted-foreground/60"
                rows={1}
                disabled={!selectedAgentId || !isAgentActive || isTyping}
              />
              {/* Reflection mode toggle (circle button) */}
              <button
                onClick={() => setReflectionMode((prev) => !prev)}
                disabled={!selectedAgentId || !isAgentActive}
                className={cn(
                  'h-[44px] w-[44px] rounded-full flex items-center justify-center transition-all duration-300 shrink-0 border-2',
                  reflectionMode
                    ? 'border-[#06b6d4] bg-[#06b6d4]/15 text-[#06b6d4] shadow-[0_0_16px_rgba(6,182,212,0.3)]'
                    : 'border-transparent text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10 hover:border-violet-500/30',
                  'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-muted-foreground'
                )}
                title={reflectionMode ? 'Désactiver le mode réflexion' : 'Activer le mode réflexion'}
              >
                <Brain className={cn('h-4 w-4', reflectionMode && 'animate-pulse')} />
              </button>
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
                  disabled={!input.trim() || !selectedAgentId || !isAgentActive}
                  className="h-[44px] w-[44px] rounded-xl bg-gradient-to-br from-[#06b6d4] to-violet-500 text-white hover:from-[#06b6d4]/90 hover:to-violet-500/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 shrink-0 shadow-lg shadow-[#06b6d4]/20 hover:scale-105 active:scale-95 disabled:hover:scale-100"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-2">
              {/* Features button (rectangle — show other project functions) */}
              <button
                onClick={() => setFeaturesOpen((prev) => !prev)}
                className={cn(
                  'flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-all duration-200',
                  featuresOpen
                    ? 'border-[#06b6d4]/40 bg-[#06b6d4]/10 text-[#06b6d4]'
                    : 'border-border/50 text-muted-foreground/60 hover:text-foreground/80 hover:border-border'
                )}
              >
                <Grid3X3 className="h-3 w-3" />
                Fonctions
              </button>
              {selectedAgent && !isAgentActive ? (
                <p className="text-[10px] text-amber-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Inactif
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground/40">
                  Entrée pour envoyer
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {reflectionMode && (
                <span className="text-[10px] text-[#06b6d4] font-medium flex items-center gap-1">
                  <Brain className="h-3 w-3" /> Réflexion
                </span>
              )}
              {isTyping && (
                <p className="text-[10px] text-[#06b6d4] font-medium flex items-center gap-1">
                  <Sparkles className="h-3 w-3 animate-pulse" /> Génération en cours...
                </p>
              )}
            </div>
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
