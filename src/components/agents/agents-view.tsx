'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { AgentCard } from './agent-card';
import { AgentCreateDialog } from './agent-create-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Plus, Bot, Loader2, Send, X, Zap, Brain } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export function AgentsView() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Chat state
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStreaming, setChatStreaming] = useState('');
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadAgents = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/agents?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatStreaming]);

  const handleToggle = async (id: string) => {
    try {
      const res = await fetch(`/api/agents/${id}/toggle`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status: updated.status } : a)));
        toast({
          title: updated.status === 'active' ? 'Agent activé' : 'Agent désactivé',
          description: `L'agent a été ${updated.status === 'active' ? 'activé' : 'désactivé'}`,
        });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors du changement de statut', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/agents/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.id !== deleteId));
        toast({ title: 'Agent supprimé', description: 'L\'agent a été supprimé' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors de la suppression', variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditAgent(agent);
    setCreateOpen(true);
  };

  const openChat = (agent: Agent) => {
    setChatAgent(agent);
    setChatMessages([]);
    setChatInput('');
    setChatStreaming('');
    setChatConversationId(null);
    setChatOpen(true);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !chatAgent || chatLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString(),
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    setChatStreaming('');

    try {
      const res = await fetch(`/api/agents/${chatAgent.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: chatInput,
          conversationId: chatConversationId,
          taskType: 'quick_chat',
        }),
      });

      if (!res.ok) throw new Error('Erreur serveur');

      const newConvId = res.headers.get('X-Conversation-Id');
      if (newConvId) setChatConversationId(newConvId);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const json = JSON.parse(line.slice(6));
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                  setChatStreaming(fullContent);
                }
              } catch {
                // skip
              }
            }
          }
        }
      }

      if (fullContent) {
        setChatMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: fullContent,
          timestamp: new Date().toISOString(),
        }]);
      }
      setChatStreaming('');
    } catch {
      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Erreur de connexion au serveur IA. Veuillez réessayer.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Vos Agents IA</h2>
          <p className="text-sm text-muted-foreground">{agents.length} agent(s) configuré(s)</p>
        </div>
        <Button className="gap-2 float-action" onClick={() => { setEditAgent(null); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" />
          Créer un agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Aucun agent"
          description="Créez votre premier agent IA pour commencer à automatiser vos tâches"
          actionLabel="Créer un agent"
          onAction={() => { setEditAgent(null); setCreateOpen(true); }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent, index) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08, duration: 0.35, ease: 'easeOut' }}
            >
              <AgentCard
                agent={agent}
                onToggle={handleToggle}
                onDelete={setDeleteId}
                onEdit={handleEdit}
                onChat={agent.status === 'active' ? openChat : undefined}
              />
            </motion.div>
          ))}
        </div>
      )}

      <AgentCreateDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setEditAgent(null);
        }}
        onSuccess={loadAgents}
        editAgent={editAgent}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet agent ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Toutes les tâches associées seront également supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Agent Chat Sheet */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="p-4 border-b border-border/50">
            <SheetTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              Discussion avec {chatAgent?.name}
              {chatAgent && (
                <Badge variant="outline" className="text-[10px] ml-1">
                  {chatAgent.type}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {chatMessages.length === 0 && !chatLoading && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="p-3 rounded-2xl bg-primary/10 mb-3">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-sm font-semibold mb-1">{chatAgent?.name}</h3>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Discutez directement avec cet agent IA. Il se souviendra de votre conversation.
                </p>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {chatMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border/50'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Streaming content */}
            {chatStreaming && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-card border border-border/50">
                  <p className="text-sm whitespace-pre-wrap">{chatStreaming}<span className="animate-pulse">▋</span></p>
                </div>
              </motion.div>
            )}

            {/* Loading indicator */}
            {chatLoading && !chatStreaming && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3 bg-card border border-border/50">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
                    <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
                    <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="p-4 border-t border-border/50">
            <div className="flex items-end gap-2">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder={`Envoyer un message à ${chatAgent?.name || 'l\'agent'}...`}
                className="min-h-[40px] max-h-24 resize-none text-sm"
                rows={1}
              />
              <Button
                size="icon"
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInput.trim()}
                className="flex-shrink-0 h-10 w-10"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-center gap-3 mt-2">
              <Badge variant="outline" className="text-[9px] h-4 gap-1">
                <Zap className="h-2 w-2 text-orange-500" /> Groq
              </Badge>
              <Badge variant="outline" className="text-[9px] h-4 gap-1">
                <Brain className="h-2 w-2 text-purple-500" /> OpenRouter
              </Badge>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
