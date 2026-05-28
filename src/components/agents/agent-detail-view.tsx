'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Bot,
  ArrowLeft,
  Send,
  Loader2,
  Globe,
  Megaphone,
  MessageCircle,
  Phone,
  Youtube,
  Facebook,
  Instagram,
  Linkedin,
  Zap,
  Cpu,
  Server,
  Mail,
  Database,
  Calendar,
  Search,
  ShieldCheck,
  Monitor,
  ArrowLeft as BackIcon,
  ArrowRight as ForwardIcon,
  RotateCcw,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Power,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { ChatMessage } from '@/components/shared/chat-message';

interface Agent {
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

interface BrowserSession {
  id: string;
  agentId: string;
  url: string;
  title: string | null;
  status: string;
  screenshot: string | null;
}

interface ActionLog {
  id: string;
  action: string;
  details: string;
  status: string;
  result: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface ChatMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

const toolIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  browse_web: Globe,
  social_youtube: Youtube,
  social_facebook: Facebook,
  social_instagram: Instagram,
  social_tiktok: MessageCircle,
  social_linkedin: Linkedin,
  social_post: Megaphone,
  whatsapp_message: MessageCircle,
  whatsapp_call: Phone,
  use_api: Zap,
  use_cpu: Cpu,
  use_mvp: Server,
  email: Mail,
  crm: Database,
  calendar: Calendar,
  web_search: Search,
};

const toolColors: Record<string, string> = {
  browse_web: 'text-sky-500',
  social_youtube: 'text-red-500',
  social_facebook: 'text-blue-500',
  social_instagram: 'text-pink-500',
  social_tiktok: 'text-white',
  social_linkedin: 'text-blue-400',
  social_post: 'text-orange-500',
  whatsapp_message: 'text-green-500',
  whatsapp_call: 'text-green-400',
  use_api: 'text-yellow-500',
  use_cpu: 'text-purple-400',
  use_mvp: 'text-emerald-500',
  email: 'text-amber-500',
  crm: 'text-cyan-500',
  calendar: 'text-indigo-400',
  web_search: 'text-teal-500',
};

const toolLabels: Record<string, string> = {
  browse_web: 'Navigation Web',
  social_youtube: 'YouTube',
  social_facebook: 'Facebook',
  social_instagram: 'Instagram',
  social_tiktok: 'TikTok',
  social_linkedin: 'LinkedIn',
  social_post: 'Publications',
  whatsapp_message: 'Messages WhatsApp',
  whatsapp_call: 'Appels WhatsApp',
  use_api: 'APIs',
  use_cpu: 'CPU',
  use_mvp: 'MVP',
  email: 'Email',
  crm: 'CRM',
  calendar: 'Calendrier',
  web_search: 'Recherche Web',
};

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  social_media: Megaphone,
  whatsapp: MessageCircle,
  browser: Monitor,
  sales: Phone,
  support: MessageCircle,
  marketing: Mail,
  research: Search,
  rh: Database,
  accounting: Database,
  custom: Bot,
};

const typeLabels: Record<string, string> = {
  social_media: 'Social Media',
  whatsapp: 'WhatsApp',
  browser: 'Navigateur',
  sales: 'Commercial',
  support: 'Support',
  marketing: 'Marketing',
  research: 'Recherche',
  rh: 'RH',
  accounting: 'Comptabilité',
  custom: 'Personnalisé',
};

const actionStatusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  completed: CheckCircle2,
  rejected: XCircle,
  failed: AlertCircle,
};

const actionStatusColors: Record<string, string> = {
  pending: 'text-amber-500',
  completed: 'text-emerald-500',
  rejected: 'text-red-500',
  failed: 'text-red-500',
};

interface AgentDetailViewProps {
  agent: Agent;
  onBack: () => void;
}

export function AgentDetailView({ agent, onBack }: AgentDetailViewProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [browserSession, setBrowserSession] = useState<BrowserSession | null>(null);
  const [browserUrl, setBrowserUrl] = useState('');
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [permissions, setPermissions] = useState<Agent['permissions']>(agent.permissions || []);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const TypeIcon = typeIcons[agent.type] || Bot;
  const isActive = agent.status === 'active';

  // Parse config
  let configTools: string[] = [];
  let personality = '';
  let instructions = '';
  try {
    const parsed = JSON.parse(agent.config || '{}');
    configTools = parsed.tools || [];
    personality = parsed.personality || 'professional';
    instructions = parsed.instructions || '';
  } catch {
    // ignore
  }

  const hasBrowser = configTools.includes('browse_web');

  // Load browser session
  useEffect(() => {
    if (hasBrowser && agent.id) {
      loadBrowserSession();
    }
  }, [agent.id, hasBrowser]);

  // Load action logs
  useEffect(() => {
    if (agent.id) {
      loadActionLogs();
    }
  }, [agent.id]);

  // Load permissions
  useEffect(() => {
    if (agent.id) {
      loadPermissions();
    }
  }, [agent.id]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadBrowserSession = async () => {
    try {
      const data = await apiFetch<BrowserSession>(`/api/agents/${agent.id}/browser`);
      setBrowserSession(data);
      setBrowserUrl(data.url || 'about:blank');
    } catch {
      // silently fail
    }
  };

  const loadActionLogs = async () => {
    try {
      // Reuse the agents endpoint with action logs
      // Since there's no dedicated endpoint, we'll use what we have
      const data = await apiFetch<ActionLog[]>(`/api/activities?agentId=${agent.id}`);
      setActionLogs(data);
    } catch {
      setActionLogs([]);
    }
  };

  const loadPermissions = async () => {
    setLoadingPerms(true);
    try {
      const data = await apiFetch<{ permissions: Agent['permissions'] }>(`/api/agents/${agent.id}/permissions`);
      setPermissions(data.permissions || []);
    } catch {
      // Use what we have
    } finally {
      setLoadingPerms(false);
    }
  };

  const handleTogglePermission = async (permId: string, field: 'granted' | 'requiresApproval') => {
    const perm = permissions?.find((p) => p.id === permId);
    if (!perm) return;

    const updatedPerm = { ...perm, [field]: !perm[field] };

    try {
      await apiFetch(`/api/agents/${agent.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({
          permissions: [updatedPerm],
        }),
      });

      setPermissions((prev) =>
        prev?.map((p) => (p.id === permId ? updatedPerm : p))
      );

      toast({
        title: 'Permission mise à jour',
        description: `${toolLabels[perm.permission] || perm.permission} ${field === 'granted' ? (updatedPerm.granted ? 'activée' : 'désactivée') : (updatedPerm.requiresApproval ? 'avec approbation' : 'sans approbation')}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isStreaming) return;

    const userMsg: ChatMsg = {
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsStreaming(true);

    // Add placeholder for assistant response
    const assistantMsg: ChatMsg = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await fetch(`/api/agents/${agent.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: userMsg.content }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

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
                if (parsed.content) {
                  fullContent += parsed.content;
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = {
                      ...newMessages[newMessages.length - 1],
                      content: fullContent,
                    };
                    return newMessages;
                  });
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          role: 'system',
          content: 'Erreur: impossible de contacter l\'agent. Veuillez réessayer.',
          timestamp: new Date().toISOString(),
        };
        return newMessages;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleBrowserNavigate = async () => {
    if (!browserUrl.trim()) return;
    try {
      const data = await apiFetch<BrowserSession>(`/api/agents/${agent.id}/browser`, {
        method: 'POST',
        body: JSON.stringify({ action: 'navigate', url: browserUrl }),
      });
      setBrowserSession(data);
      toast({ title: 'Navigation', description: `Navigation vers ${browserUrl}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de navigation';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    }
  };

  const handleToggleAgent = async () => {
    try {
      const data = await apiFetch<{ status: string }>(`/api/agents/${agent.id}/toggle`, {
        method: 'POST',
      });
      toast({
        title: data.status === 'active' ? 'Agent activé' : 'Agent désactivé',
        description: `L'agent a été ${data.status === 'active' ? 'activé' : 'désactivé'}`,
      });
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors du changement de statut', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <div className={`p-2 rounded-xl ${isActive ? 'bg-primary/10' : 'bg-muted'}`}>
            <TypeIcon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{agent.name}</h2>
            <p className="text-xs text-muted-foreground">{typeLabels[agent.type] || agent.type} • {agent.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={isActive ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground'}>
            {isActive ? 'Actif' : 'Inactif'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleToggleAgent}
          >
            <Power className={`h-3.5 w-3.5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            {isActive ? 'Désactiver' : 'Activer'}
          </Button>
        </div>
      </div>

      {/* Main Layout - 3 panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[600px]">
        {/* Left Panel - Agent Info & Permissions */}
        <div className="lg:col-span-3 space-y-4">
          {/* Agent Info */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                Informations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Personnalité</p>
                <Badge variant="secondary" className="mt-1 capitalize">{personality}</Badge>
              </div>
              {instructions && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Instructions</p>
                  <p className="text-xs text-foreground/80 line-clamp-4 bg-muted/30 p-2 rounded-md">{instructions}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Outils activés</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {configTools.length > 0 ? configTools.map((tool) => {
                    const ToolIcon = toolIcons[tool];
                    return ToolIcon ? (
                      <div key={tool} className="p-1 rounded bg-muted/50 border border-border/30" title={toolLabels[tool] || tool}>
                        <ToolIcon className={`h-3.5 w-3.5 ${toolColors[tool] || 'text-muted-foreground'}`} />
                      </div>
                    ) : null;
                  }) : (
                    <span className="text-xs text-muted-foreground">Aucun outil</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Permissions */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Permissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-64">
                <div className="space-y-2 pr-2">
                  {permissions && permissions.length > 0 ? permissions.map((perm) => {
                    const ToolIcon = toolIcons[perm.permission];
                    return (
                      <div key={perm.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {ToolIcon ? (
                              <ToolIcon className={`h-3.5 w-3.5 ${toolColors[perm.permission] || 'text-muted-foreground'}`} />
                            ) : (
                              <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <span className="text-xs">{toolLabels[perm.permission] || perm.permission}</span>
                          </div>
                          <Switch
                            checked={perm.granted}
                            onCheckedChange={() => handleTogglePermission(perm.id, 'granted')}
                            className="scale-75"
                          />
                        </div>
                        {perm.granted && (
                          <div className="flex items-center gap-2 ml-6">
                            <ShieldCheck className={`h-3 w-3 ${perm.requiresApproval ? 'text-amber-500' : 'text-muted-foreground/50'}`} />
                            <span className="text-[10px] text-muted-foreground">Approbation</span>
                            <Switch
                              checked={perm.requiresApproval}
                              onCheckedChange={() => handleTogglePermission(perm.id, 'requiresApproval')}
                              className="scale-50"
                            />
                          </div>
                        )}
                      </div>
                    );
                  }) : (
                    <p className="text-xs text-muted-foreground text-center py-4">Aucune permission configurée</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Center Panel - Chat Interface */}
        <div className="lg:col-span-5">
          <Card className="border-border/50 h-full flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                Chat avec {agent.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0">
              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-2 max-h-[450px]">
                <div className="space-y-4">
                  {messages.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Commencez une conversation avec {agent.name}</p>
                      <p className="text-xs mt-1">L&apos;agent répondra en fonction de ses permissions et instructions</p>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <ChatMessage
                      key={i}
                      role={msg.role}
                      content={msg.content}
                      timestamp={msg.timestamp}
                      isLoading={msg.role === 'assistant' && !msg.content && isStreaming}
                    />
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="p-4 border-t border-border/50">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Envoyer un message à ${agent.name}...`}
                    disabled={isStreaming}
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={isStreaming || !chatInput.trim()}>
                    {isStreaming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Browser & Actions Log */}
        <div className="lg:col-span-4 space-y-4">
          {/* Browser Preview */}
          {hasBrowser && (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  Navigateur
                  {browserSession?.status && (
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {browserSession.status}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* URL Bar */}
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => {}}>
                    <BackIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => {}}>
                    <ForwardIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={handleBrowserNavigate}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Input
                    value={browserUrl}
                    onChange={(e) => setBrowserUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleBrowserNavigate()}
                    placeholder="Entrer une URL..."
                    className="h-7 text-xs"
                  />
                  <Button variant="default" size="sm" className="h-7 px-2" onClick={handleBrowserNavigate}>
                    Go
                  </Button>
                </div>

                {/* Browser viewport */}
                <div className="bg-muted/30 rounded-lg border border-border/50 aspect-video flex items-center justify-center overflow-hidden">
                  {browserSession?.screenshot ? (
                    <img
                      src={browserSession.screenshot}
                      alt="Browser screenshot"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <Monitor className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-xs text-muted-foreground">
                        {browserSession?.url && browserSession.url !== 'about:blank'
                          ? browserSession.url
                          : 'Aucune page chargée'}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions Log */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Journal des actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-64">
                <div className="space-y-2 pr-2">
                  {actionLogs.length > 0 ? actionLogs.map((log) => {
                    const StatusIcon = actionStatusIcons[log.status] || Clock;
                    const statusColor = actionStatusColors[log.status] || 'text-muted-foreground';
                    return (
                      <div key={log.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                        <StatusIcon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${statusColor}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{log.action}</p>
                          <p className="text-[10px] text-muted-foreground line-clamp-1">
                            {log.details?.substring(0, 80) || '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(log.createdAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Activity className="h-6 w-6 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Aucune action enregistrée</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
