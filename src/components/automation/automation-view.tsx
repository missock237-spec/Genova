'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, Send, Loader2, Sparkles, CheckCircle2, ArrowRight, History, Bot, Cpu, Zap, Brain, Trash2, Play, Terminal, Eye, GripVertical, Clock, RotateCcw, Activity } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { ExecutionMonitor } from '@/components/agents/execution-monitor';

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
  tokenCount?: number;
}

interface Conversation {
  id: string;
  title: string;
  type: string;
  updatedAt: string;
  _count: { messages: number };
}

interface ExecutionStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'plan' | 'error' | 'result' | 'reflection' | 'correction' | 'retry';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  timestamp: string;
  duration?: number;
  confidence?: number;
}

const EXAMPLE_COMMANDS = [
  { text: 'Trouve 50 prospects à Douala et lance une campagne WhatsApp', icon: '🎯', category: 'Vente' },
  { text: 'Analyse les ventes du mois et génère un rapport détaillé', icon: '📊', category: 'Analyse' },
  { text: 'Planifie les rendez-vous de la semaine prochaine', icon: '📅', category: 'Planification' },
  { text: 'Vérifie les emails clients et réponds aux urgentes', icon: '📧', category: 'Support' },
  { text: 'Crée une campagne marketing pour le nouveau produit', icon: '🚀', category: 'Marketing' },
  { text: 'Génère un code Python pour scraper les données du site', icon: '💻', category: 'Code' },
];

/* ===== Provider Label Helper ===== */
function getProviderLabel(provider: string): { label: string; color: string } | null {
  switch (provider) {
    case 'groq':
      return { label: 'Groq', color: 'text-orange-500 border-orange-500/30' };
    case 'openrouter':
      return { label: 'OpenRouter', color: 'text-blue-500 border-blue-500/30' };
    default:
      return { label: provider || 'AI', color: 'text-emerald-500 border-emerald-500/30' };
  }
}

/* ===== Animated Provider Badge ===== */
function ProviderBadge({ provider }: { provider: string }) {
  const config = getProviderLabel(provider);
  if (!config) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <Badge variant="outline" className={`text-[9px] h-4 gap-1 ${config.color} badge-pulse`}>
        {provider === 'groq' && <Zap className="h-2.5 w-2.5" />}
        {provider === 'openrouter' && <Brain className="h-2.5 w-2.5" />}
        {(!provider || (provider !== 'groq' && provider !== 'openrouter')) && <Cpu className="h-2.5 w-2.5" />}
        {config.label}
      </Badge>
    </motion.div>
  );
}

/* ===== Streaming Token Counter ===== */
function StreamingTokenCounter({ tokenCount, isActive }: { tokenCount: number; isActive: boolean }) {
  if (!isActive || tokenCount === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2"
    >
      <div className="flex items-center gap-1.5">
        <motion.div
          className="w-1.5 h-1.5 rounded-full bg-emerald-500"
          animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
        <span className="text-[10px] text-emerald-600 font-medium">Streaming</span>
      </div>
      <Badge variant="outline" className="text-[9px] h-4 bg-emerald-500/5 text-emerald-600 border-emerald-500/20">
        {tokenCount} tokens
      </Badge>
    </motion.div>
  );
}

/* ===== Execution Progress Bar ===== */
function ExecutionProgressBar({ steps, totalSteps }: { steps: number; totalSteps: number }) {
  const progress = totalSteps > 0 ? Math.round((steps / totalSteps) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Progression de l'exécution</span>
        <span className="text-[10px] font-medium text-emerald-600">{progress}%</span>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-emerald-500 progress-bar-shine"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">
          Étape {steps} sur {totalSteps}
        </span>
      </div>
    </div>
  );
}

/* ===== Draggable Plan Step (Visual only) ===== */
function PlanStepItem({ step, index, total }: { step: CommandStep; index: number; total: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      className="flex items-start gap-3 group"
    >
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="cursor-grab active:cursor-grabbing p-0.5 rounded opacity-0 group-hover:opacity-50 transition-opacity">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-center">
        <motion.div
          whileHover={{ scale: 1.1 }}
          className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center text-xs font-bold text-emerald-600"
        >
          {index + 1}
        </motion.div>
        {index < total - 1 && (
          <div className="w-0.5 h-4 bg-emerald-500/20 mt-1" />
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
  );
}

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
  const [streamingTokenCount, setStreamingTokenCount] = useState(0);
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  const [mode, setMode] = useState<'chat' | 'execution'>('chat');
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState({ current: 0, total: 0 });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; type: string; status: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();

  // Auto-rotate example commands
  useEffect(() => {
    if (messages.length > 0) return;
    const interval = setInterval(() => {
      setCurrentExample(prev => (prev + 1) % EXAMPLE_COMMANDS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [messages.length]);

  // Load conversations and agents
  useEffect(() => {
    if (user?.id) {
      loadConversations();
      loadAgents();
    }
  }, [user?.id]);

  // Smooth scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, executionSteps, scrollToBottom]);

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

  const loadAgents = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/agents?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.filter((a: { status: string }) => a.status === 'active') || []);
        if (data.length > 0) setSelectedAgentId(data[0].id);
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
    setStreamingTokenCount(0);
    setIsStreamingActive(false);
    setExecutionSteps([]);
    setExecutionProgress({ current: 0, total: 0 });
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
    setStreamingTokenCount(0);
    setIsStreamingActive(true);

    try {
      const res = await fetch('/api/ai/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: input, userId: user?.id, conversationId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setIsStreamingActive(false);
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

      // Simulate streaming token count
      const totalTokens = data._meta?.tokens || Math.floor(Math.random() * 500) + 200;
      const tokenInterval = setInterval(() => {
        setStreamingTokenCount(prev => {
          const next = prev + Math.floor(Math.random() * 15) + 5;
          if (next >= totalTokens) {
            clearInterval(tokenInterval);
            setIsStreamingActive(false);
            return totalTokens;
          }
          return next;
        });
      }, 50);

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
        tokenCount: totalTokens,
      };

      // Delay adding the message slightly to show streaming
      setTimeout(() => {
        setMessages(prev => [...prev, assistantMessage]);
        setIsStreamingActive(false);
        clearInterval(tokenInterval);
      }, 800);
    } catch {
      setIsStreamingActive(false);
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
    const totalSteps = currentPlan.steps.length;
    setExecutionProgress({ current: 0, total: totalSteps });

    try {
      for (let i = 0; i < currentPlan.steps.length; i++) {
        const step = currentPlan.steps[i];
        setExecutionProgress({ current: i, total: totalSteps });

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

        // Simulate step completion
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setExecutionProgress({ current: totalSteps, total: totalSteps });

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

  /**
   * Execute agent with the ReAct loop
   */
  const executeAgentReAct = async () => {
    if (!input.trim() || !user?.id || isExecuting) return;

    const agentId = selectedAgentId || agents[0]?.id;
    if (!agentId) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: 'Aucun agent actif disponible. Créez d\'abord un agent.',
        timestamp: new Date().toISOString(),
      }]);
      return;
    }

    setIsExecuting(true);
    setExecutionSteps([]);
    setExecutionProgress({ current: 0, total: 10 });

    try {
      const res = await fetch(`/api/agents/${agentId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: input,
          maxSteps: 10,
          conversationId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur d\'exécution');
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = '';
        let stepCount = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const event = JSON.parse(line.slice(6));

                if (event.type === 'step' && event.step) {
                  stepCount++;
                  setExecutionSteps(prev => [...prev, event.step]);
                  setExecutionProgress({ current: stepCount, total: 10 });
                } else if (event.type === 'complete') {
                  setExecutionProgress({ current: 10, total: 10 });
                  setIsExecuting(false);
                } else if (event.type === 'error') {
                  setExecutionSteps(prev => [...prev, {
                    id: `error_${Date.now()}`,
                    type: 'error',
                    content: event.error || 'Erreur inconnue',
                    timestamp: new Date().toISOString(),
                  }]);
                  setIsExecuting(false);
                }
              } catch {
                // skip unparseable events
              }
            }
          }
        }
      }

      setInput('');
    } catch (error) {
      setExecutionSteps(prev => [...prev, {
        id: `error_${Date.now()}`,
        type: 'error',
        content: error instanceof Error ? error.message : 'Erreur d\'exécution',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (mode === 'execution') {
        executeAgentReAct();
      } else {
        sendMessage();
      }
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-emerald-500" />
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

      {/* Mode tabs */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'chat' | 'execution')} className="mb-3">
        <TabsList className="h-8">
          <TabsTrigger value="chat" className="text-xs gap-1.5 px-3 h-6">
            <Bot className="h-3 w-3" /> Orchestration
          </TabsTrigger>
          <TabsTrigger value="execution" className="text-xs gap-1.5 px-3 h-6">
            <Terminal className="h-3 w-3" /> Exécution Agent
          </TabsTrigger>
        </TabsList>
      </Tabs>

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

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {mode === 'execution' ? (
            /* Agent Execution Mode */
            <div className="flex-1 flex flex-col min-h-0">
              {/* Agent selector */}
              {agents.length > 0 && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-xs text-muted-foreground">Agent:</span>
                  {agents.map((agent) => (
                    <Button
                      key={agent.id}
                      variant={selectedAgentId === agent.id ? 'default' : 'outline'}
                      size="sm"
                      className={`text-xs h-7 gap-1 ${selectedAgentId === agent.id ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                      onClick={() => setSelectedAgentId(agent.id)}
                    >
                      <Cpu className="h-3 w-3" /> {agent.name}
                    </Button>
                  ))}
                </div>
              )}

              {/* Execution progress bar */}
              {isExecuting && executionProgress.total > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3"
                >
                  <ExecutionProgressBar
                    steps={executionProgress.current}
                    totalSteps={executionProgress.total}
                  />
                </motion.div>
              )}

              {/* Execution monitor */}
              <div className="flex-1 min-h-0">
                <ExecutionMonitor
                  steps={executionSteps}
                  isRunning={isExecuting}
                  agentName={agents.find(a => a.id === selectedAgentId)?.name || 'Agent'}
                  task={input}
                />
              </div>
            </div>
          ) : (
            /* Chat / Orchestration Mode */
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1 custom-scrollbar"
            >
              {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="p-4 rounded-2xl bg-emerald-500/10 mb-4 agent-glow"
                  >
                    <Sparkles className="h-10 w-10 text-emerald-500" />
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

                    <div className="flex justify-center gap-1.5 mt-2">
                      {EXAMPLE_COMMANDS.map((_, i) => (
                        <button
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                            i === currentExample ? 'bg-emerald-500 w-4' : 'bg-muted-foreground/30'
                          }`}
                          onClick={() => setCurrentExample(i)}
                        />
                      ))}
                    </div>
                  </motion.div>

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
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          {msg.role === 'assistant' ? (
                            <Bot className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Cpu className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      )}
                      <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                        <div className={`rounded-2xl px-4 py-3 ${
                          msg.role === 'user'
                            ? 'bg-emerald-600 text-white'
                            : msg.role === 'system'
                            ? 'bg-muted border border-border/50'
                            : 'bg-card border border-border/50 glass-card'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1 px-1 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {msg.provider && <ProviderBadge provider={msg.provider} />}
                          {msg.tokenCount && (
                            <Badge variant="outline" className="text-[9px] h-4 bg-muted/50">
                              {msg.tokenCount} tokens
                            </Badge>
                          )}
                        </div>

                        {/* Plan card with enhanced visualization */}
                        {msg.plan && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            transition={{ duration: 0.4, delay: 0.2 }}
                            className="mt-3"
                          >
                            <Card className="border-emerald-500/20 bg-emerald-500/5 glass-card-emerald">
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                                  <Sparkles className="h-4 w-4" />
                                  Plan d&apos;action proposé
                                  {msg.plan._meta && msg.plan._meta.provider && (
                                    <ProviderBadge provider={msg.plan._meta.provider} />
                                  )}
                                </div>
                                {msg.plan.steps?.map((step, i) => (
                                  <PlanStepItem
                                    key={i}
                                    step={step}
                                    index={i}
                                    total={msg.plan?.steps?.length || 0}
                                  />
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

              {/* Streaming content display with token counter */}
              {(streamingContent || (loading && !streamingContent)) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 justify-start"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="max-w-[80%]">
                    <div className="rounded-2xl px-4 py-3 bg-card border border-border/50 glass-card">
                      {loading && !streamingContent ? (
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 typing-dot-improved" />
                            <div className="w-2 h-2 rounded-full bg-emerald-500 typing-dot-improved" />
                            <div className="w-2 h-2 rounded-full bg-emerald-500 typing-dot-improved" />
                          </div>
                          <StreamingTokenCounter tokenCount={streamingTokenCount} isActive={isStreamingActive} />
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{streamingContent}<span className="animate-pulse">▋</span></p>
                      )}
                    </div>
                    {isStreamingActive && (
                      <div className="mt-1 px-1">
                        <StreamingTokenCounter tokenCount={streamingTokenCount} isActive={isStreamingActive} />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Execution button + progress */}
          <AnimatePresence>
            {mode === 'chat' && currentPlan && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-3 space-y-2"
              >
                {executing && (
                  <ExecutionProgressBar
                    steps={executionProgress.current}
                    totalSteps={executionProgress.total || currentPlan.steps.length}
                  />
                )}
                <Button
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 agent-glow-strong"
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
                placeholder={
                  mode === 'execution'
                    ? "Décrivez la tâche à exécuter par l'agent (ReAct)..."
                    : 'Décrivez ce que vous voulez accomplir...'
                }
                className="min-h-[44px] max-h-32 resize-none border-0 bg-transparent focus-visible:ring-0 text-sm"
                rows={1}
              />
              <Button
                size="icon"
                onClick={mode === 'execution' ? executeAgentReAct : sendMessage}
                disabled={loading || isExecuting || !input.trim()}
                className="flex-shrink-0 h-10 w-10 bg-emerald-600 hover:bg-emerald-700"
              >
                {mode === 'execution' ? (
                  isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </motion.div>

          {/* Mode indicator */}
          <div className="flex items-center justify-center gap-3 mt-2">
            {mode === 'execution' ? (
              <>
                <Badge variant="outline" className="text-[10px] h-5 gap-1">
                  <Terminal className="h-2.5 w-2.5 text-emerald-500" /> ReAct Loop
                </Badge>
                <Badge variant="outline" className="text-[10px] h-5 gap-1">
                  <Eye className="h-2.5 w-2.5 text-sky-500" /> Exécution transparente
                </Badge>
                <Badge variant="outline" className="text-[10px] h-5 gap-1">
                  <RotateCcw className="h-2.5 w-2.5 text-amber-500" /> Auto-Retry
                </Badge>
              </>
            ) : (
              <>
                <Badge variant="outline" className="text-[10px] h-5 gap-1">
                  <Zap className="h-2.5 w-2.5 text-orange-500" /> Groq — Vitesse
                </Badge>
                <Badge variant="outline" className="text-[10px] h-5 gap-1">
                  <Brain className="h-2.5 w-2.5 text-purple-500" /> OpenRouter — Intelligence
                </Badge>
                <Badge variant="outline" className="text-[10px] h-5 gap-1">
                  <Activity className="h-2.5 w-2.5 text-emerald-500" /> Orchestration
                </Badge>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
