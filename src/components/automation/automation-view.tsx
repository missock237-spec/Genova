'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChatMessage } from '@/components/shared/chat-message';
import { Wand2, Send, Loader2, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';

interface CommandStep {
  title: string;
  description: string;
  agentType: string;
  priority: string;
}

interface OrchestrationPlan {
  understanding: string;
  steps: CommandStep[];
  estimatedTime: string;
  summary: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  plan?: OrchestrationPlan;
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
  const [userId, setUserId] = useState<string | null>(null);

  // Get userId from localStorage
  useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('agentos_user');
        if (saved) {
          const user = JSON.parse(saved);
          setUserId(user.id);
        }
      } catch {
        // ignore
      }
    }
  });

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setCurrentPlan(null);

    try {
      const res = await fetch('/api/ai/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: input, userId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'system',
            content: `Erreur: ${data.error || 'Impossible de traiter la commande'}`,
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }

      const plan: OrchestrationPlan = data;
      setCurrentPlan(plan);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `**Compréhension:** ${plan.understanding}\n\n**Plan:**\n${plan.steps?.map((s: CommandStep, i: number) => `${i + 1}. ${s.title} — ${s.description}`).join('\n')}\n\n**Temps estimé:** ${plan.estimatedTime}\n\n**Résumé:** ${plan.summary}`,
        timestamp: new Date().toISOString(),
        plan,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'system',
          content: 'Erreur de connexion au serveur IA',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const executePlan = async () => {
    if (!currentPlan || !userId) return;
    setExecuting(true);

    try {
      // Create tasks for each step
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
            userId,
          }),
        });
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'system',
          content: `Plan exécuté ! ${currentPlan.steps.length} tâche(s) créée(s) et en cours de traitement.`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setCurrentPlan(null);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'system',
          content: 'Erreur lors de l\'exécution du plan',
          timestamp: new Date().toISOString(),
        },
      ]);
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
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1 custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 rounded-2xl bg-primary/10 mb-4 agent-glow">
              <Sparkles className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Comment puis-je vous aider ?</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Décrivez une tâche en langage naturel et je créerai un plan d&apos;action avec vos agents IA
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {[
                'Trouve 50 prospects à Douala et lance une campagne WhatsApp',
                'Analyse les ventes du mois et génère un rapport',
                'Planifie les rendez-vous de la semaine prochaine',
                'Vérifie les emails clients et réponds aux urgentes',
              ].map((example) => (
                <Button
                  key={example}
                  variant="outline"
                  className="text-xs h-auto py-2 px-3 justify-start text-left"
                  onClick={() => setInput(example)}
                >
                  <Wand2 className="h-3 w-3 mr-2 flex-shrink-0 text-primary" />
                  <span className="truncate">{example}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <ChatMessage role={msg.role} content={msg.content} timestamp={msg.timestamp} />
            {msg.plan && (
              <div className="mt-3 ml-11">
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Sparkles className="h-4 w-4" />
                      Plan d&apos;action proposé
                    </div>
                    {msg.plan.steps?.map((step, i) => (
                      <div key={i} className="flex items-start gap-3">
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
                          <div className="flex gap-1.5 mt-1">
                            <Badge variant="outline" className="text-[10px] h-5">
                              {step.agentType}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] h-5">
                              {step.priority}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-2">
                      <Badge variant="secondary" className="text-[10px]">
                        ⏱ {msg.plan.estimatedTime}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <ChatMessage role="assistant" content="" isLoading />
        )}
      </div>

      {/* Execution button */}
      {currentPlan && !loading && (
        <div className="mb-3">
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
        </div>
      )}

      {/* Input area */}
      <div className="relative command-input-glow rounded-xl">
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
      </div>
    </div>
  );
}
