'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, Send, Loader2, Sparkles, CheckCircle2, ArrowRight, History, Bot, Cpu, Zap, Brain, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/lib/store';

interface CommandStep {
  title: string;
  description: string;
  agentType: string;
  priority: string;
  estimatedDuration?: string;
}

interface OrchestrationPlan {
  understanding: string;
  steps: CommandStep[];
  estimatedTime: string;
  summary: string;
  riskAssessment?: string;
  _meta?: { model: string; provider: string };
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  plan?: OrchestrationPlan;
  model?: string;
  provider?: string;
}

interface Conversation {
  id: string;
  title: string;
  type: string;
  updatedAt: string;
  _count: { messages: number };
}

const EXAMPLE_COMMANDS = [
  { text: 'Trouve 50 prospects à Douala et lance une campagne WhatsApp', icon: '🎯', category: 'Vente' },
  { text: 'Analyse les ventes du mois et génère un rapport détaillé', icon: '📊', category: 'Analyse' },
  { text: 'Planifie les rendez-vous de la semaine prochaine', icon: '📅', category: 'Planification' },
  { text: 'Vérifie les emails clients et réponds aux urgentes', icon: '📧', category: 'Support' },
  { text: 'Crée une campagne marketing pour le nouveau produit', icon: '🚀', category: 'Marketing' },
  { text: 'Génère un code Python pour scraper les données du site', icon: '💻', category: 'Code' },
];

export function CommandInput() {
  return null;
}

export function AutomationView() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<OrchestrationPlan | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentExample, setCurrentExample] = useState(0);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();

  // Auto-rotate example commands
  useEffect(() => {
    if (messages.length > 0) return;
    const interval = setInterval(() => {
      setCurrentExample(prev => (prev + 1) % EXAMPLE_COMMANDS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [messages.length]);

  // Load conversations
  useEffect(() => {
    if (user?.id) {
      loadConversations();
    }
  }, [user?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const loadConversations = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/conversations?userId=${user.id}&type=orchestration`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // ignore
    }
  };

  const loadConversation = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages.map((m: { id: string; role: string; content: string; createdAt: string; model?: string; provider?: string }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          timestamp: m.createdAt,
          model: m.model,
          provider: m.provider,
        })));
        setConversationId(id);
        setShowHistory(false);
      }
    } catch {
      // ignore
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setConversationId(null);
    setCurrentPlan(null);
    setStreamingContent('');
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setCurrentPlan(null);
    setStreamingContent('');

    try {
      // Use orchestration endpoint for planning
      const res = await fetch('/api/ai/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: input, userId: user?.id, conversationId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'system',
          content: `Erreur: ${data.error || 'Impossible de traiter la commande'}`,
          timestamp: new Date().toISOString(),
        }]);
        return;
      }

      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      const plan: OrchestrationPlan = data;
      setCurrentPlan(plan);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: plan.summary || plan.understanding,
        timestamp: new Date().toISOString(),
        plan,
        model: data._meta?.model,
        provider: data._meta?.provider,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: 'Erreur de connexion au serveur IA',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Stream chat for direct agent conversations
  const sendStreamMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setStreamingContent('');

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })), { role: 'user', content: input }],
          conversationId,
          userId: user?.id,
          taskType: 'quick_chat',
        }),
      });

      if (!res.ok) throw new Error('Erreur serveur');

      const newConvId = res.headers.get('X-Conversation-Id');
      if (newConvId) setConversationId(newConvId);

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
                  setStreamingContent(fullContent);
                }
              } catch {
                // skip unparseable lines
              }
            }
          }
        }
      }

      // Add the complete message
      if (fullContent) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: fullContent,
          timestamp: new Date().toISOString(),
        }]);
      }
      setStreamingContent('');
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: 'Erreur de connexion au serveur IA',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const executePlan = async () => {
    if (!currentPlan || !user?.id) return;
    setExecuting(true);

    try {
      for (let i = 0; i < currentPlan.steps.length; i++) {
        const step = currentPlan.steps[i];
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: step.title,
            description: step.description,
            status: i === 0 ? 'running' : 'pending',
            priority: step.priority || 'medium',
            userId: user.id,
          }),
        });
      }

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: `Plan exécuté ! ${currentPlan.steps.length} tâche(s) créée(s) et en cours de traitement.`,
        timestamp: new Date().toISOString(),
      }]);
      setCurrentPlan(null);
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: 'Erreur lors de l\'exécution du plan',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getProviderLabel = (provider?: string) => {
    if (!provider) return null;
    if (provider === 'groq') return { label: 'Groq ⚡', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' };
    if (provider === 'openrouter') return { label: 'OpenRouter 🧠', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' };
    if (provider === 'groq/openrouter') return { label: 'Auto-routé', color: 'bg-primary/10 text-primary border-primary/20' };
    return { label: provider, color: 'bg-muted text-muted-foreground' };
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Automatisation intelligente
          </h2>
          <p className="text-sm text-muted-foreground">Décrivez ce que vous voulez, l&apos;IA s&apos;occupe du reste</p>
        </div>
        <div className="flex items-center gap-2">
          {conversationId && (
            <Button variant="ghost" size="sm" onClick={clearConversation} className="gap-1 text-muted-foreground">
              <Trash2 className="h-3 w-3" /> Nouvelle conversation
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)} className="gap-1">
            <History className="h-3 w-3" /> Historique
          </Button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* History sidebar */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-r border-border/50 overflow-hidden flex-shrink-0"
            >
              <div className="p-3 h-full overflow-y-auto">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <History className="h-3 w-3" /> Conversations
                </h3>
                {conversations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune conversation</p>
                ) : (
                  <div className="space-y-1">
                    {conversations.map((conv) => (
                      <Button
                        key={conv.id}
                        variant={conv.id === conversationId ? 'secondary' : 'ghost'}
                        className="w-full justify-start text-xs h-auto py-2 px-2"
                        onClick={() => loadConversation(conv.id)}
                      >
                        <div className="text-left truncate">
                          <p className="truncate">{conv.title}</p>
                          <p className="text-[10px] text-muted-foreground">{conv._count.messages} messages</p>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1 custom-scrollbar">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="p-4 rounded-2xl bg-primary/10 mb-4 agent-glow"
                >
                  <Sparkles className="h-10 w-10 text-primary" />
                </motion.div>
                <motion.h3
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-lg font-semibold mb-2"
                >
                  Comment puis-je vous aider ?
                </motion.h3>
                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-sm text-muted-foreground max-w-md mb-6"
                >
                  Décrivez une tâche en langage naturel et je créerai un plan d&apos;action avec vos agents IA
                </motion.p>

                {/* Animated example carousel */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full max-w-lg"
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentExample}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                      className="mb-4"
                    >
                      <Button
                        variant="outline"
                        className="w-full h-auto py-3 px-4 justify-start text-left"
                        onClick={() => setInput(EXAMPLE_COMMANDS[currentExample].text)}
                      >
                        <span className="text-lg mr-3">{EXAMPLE_COMMANDS[currentExample].icon}</span>
                        <div>
                          <Badge variant="outline" className="text-[10px] h-4 mb-1">
                            {EXAMPLE_COMMANDS[currentExample].category}
                          </Badge>
                          <p className="text-sm">{EXAMPLE_COMMANDS[currentExample].text}</p>
                        </div>
                      </Button>
                    </motion.div>
                  </AnimatePresence>

                  {/* Carousel dots */}
                  <div className="flex justify-center gap-1.5 mt-2">
                    {EXAMPLE_COMMANDS.map((_, i) => (
                      <button
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                          i === currentExample ? 'bg-primary w-4' : 'bg-muted-foreground/30'
                        }`}
                        onClick={() => setCurrentExample(i)}
                      />
                    ))}
                  </div>
                </motion.div>

                {/* Other examples */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mt-4">
                  {EXAMPLE_COMMANDS.filter((_, i) => i !== currentExample).slice(0, 4).map((example, i) => (
                    <Button
                      key={i}
                      variant="ghost"
                      className="text-xs h-auto py-2 px-3 justify-start text-left"
                      onClick={() => setInput(example.text)}
                    >
                      <span className="mr-1.5">{example.icon}</span>
                      <span className="truncate">{example.text}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role !== 'user' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        {msg.role === 'assistant' ? (
                          <Bot className="h-4 w-4 text-primary" />
                        ) : (
                          <Cpu className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                      <div className={`rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : msg.role === 'system'
                          ? 'bg-muted border border-border/50'
                          : 'bg-card border border-border/50'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.provider && getProviderLabel(msg.provider) && (
                          <Badge variant="outline" className={`text-[9px] h-4 ${getProviderLabel(msg.provider)!.color}`}>
                            {getProviderLabel(msg.provider)!.label}
                          </Badge>
                        )}
                      </div>

                      {/* Plan card */}
                      {msg.plan && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          transition={{ duration: 0.4, delay: 0.2 }}
                          className="mt-3"
                        >
                          <Card className="border-primary/20 bg-primary/5">
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                                <Sparkles className="h-4 w-4" />
                                Plan d&apos;action proposé
                                {msg.plan._meta && getProviderLabel(msg.plan._meta.provider) && (
                                  <Badge variant="outline" className={`text-[9px] h-4 ml-auto ${getProviderLabel(msg.plan._meta.provider)!.color}`}>
                                    {getProviderLabel(msg.plan._meta.provider)!.label}
                                  </Badge>
                                )}
                              </div>
                              {msg.plan.steps?.map((step, i) => (
                                <motion.div
                                  key={i}
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ duration: 0.3, delay: i * 0.1 }}
                                  className="flex items-start gap-3"
                                >
                                  <div className="flex-shrink-0 flex flex-col items-center">
                                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                      {i + 1}
                                    </div>
                                    {i < msg.plan.steps.length - 1 && (
                                      <div className="w-0.5 h-4 bg-primary/20 mt-1" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{step.title}</p>
                                    <p className="text-xs text-muted-foreground">{step.description}</p>
                                    <div className="flex gap-1.5 mt-1 flex-wrap">
                                      <Badge variant="outline" className="text-[10px] h-5">
                                        {step.agentType}
                                      </Badge>
                                      <Badge variant="outline" className="text-[10px] h-5">
                                        {step.priority}
                                      </Badge>
                                      {step.estimatedDuration && (
                                        <Badge variant="outline" className="text-[10px] h-5">
                                          {step.estimatedDuration}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                              <div className="flex items-center gap-2 pt-2 flex-wrap">
                                <Badge variant="secondary" className="text-[10px]">
                                  ⏱ {msg.plan.estimatedTime}
                                </Badge>
                                {msg.plan.riskAssessment && (
                                  <Badge variant="outline" className="text-[10px]">
                                    ⚠️ {msg.plan.riskAssessment}
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Streaming content display */}
            {streamingContent && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 justify-start"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="max-w-[80%]">
                  <div className="rounded-2xl px-4 py-3 bg-card border border-border/50">
                    <p className="text-sm whitespace-pre-wrap">{streamingContent}<span className="animate-pulse">▋</span></p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Loading indicator */}
            {loading && !streamingContent && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3 justify-start"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary animate-pulse" />
                </div>
                <div className="rounded-2xl px-4 py-3 bg-card border border-border/50">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
                    <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
                    <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Execution button */}
          <AnimatePresence>
            {currentPlan && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-3"
              >
                <Button
                  className="w-full gap-2 agent-glow-strong"
                  onClick={executePlan}
                  disabled={executing}
                >
                  {executing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {executing ? 'Exécution en cours...' : 'Exécuter le plan'}
                  {!executing && <ArrowRight className="h-4 w-4" />}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative command-input-glow rounded-xl"
          >
            <div className="flex items-end gap-2 p-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Décrivez ce que vous voulez accomplir..."
                className="min-h-[44px] max-h-32 resize-none border-0 bg-transparent focus-visible:ring-0 text-sm"
                rows={1}
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="flex-shrink-0 h-10 w-10"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>

          {/* Model indicator */}
          <div className="flex items-center justify-center gap-3 mt-2">
            <Badge variant="outline" className="text-[10px] h-5 gap-1">
              <Zap className="h-2.5 w-2.5 text-orange-500" /> Groq — Vitesse
            </Badge>
            <Badge variant="outline" className="text-[10px] h-5 gap-1">
              <Brain className="h-2.5 w-2.5 text-purple-500" /> OpenRouter — Intelligence
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
