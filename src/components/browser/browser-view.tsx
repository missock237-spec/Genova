'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Globe,
  Plus,
  Play,
  Square,
  Trash2,
  Loader2,
  Search,
  MousePointerClick,
  Keyboard,
  Camera,
  FileText,
  ArrowRight,
  ExternalLink,
  Zap,
} from 'lucide-react';

type ActionType = 'navigate' | 'click' | 'type' | 'scroll' | 'screenshot' | 'extract' | 'fill_form' | 'wait';
type SessionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

interface BrowserAction {
  type: ActionType;
  selector?: string;
  value?: string;
  url?: string;
  delay?: number;
  description?: string;
}

interface BrowserSession {
  id: string;
  url: string;
  title: string | null;
  status: SessionStatus;
  stepCount: number;
  currentStep: number;
  error: string | null;
  createdAt: string;
}

interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  duration: number;
}

const ACTION_ICONS: Record<ActionType, typeof Globe> = {
  navigate: Globe,
  click: MousePointerClick,
  type: Keyboard,
  scroll: ArrowRight,
  screenshot: Camera,
  extract: FileText,
  fill_form: Keyboard,
  wait: Loader2,
};

const STATUS_COLORS: Record<SessionStatus, string> = {
  idle: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
  running: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  paused: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  completed: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  error: 'bg-red-500/10 text-red-600 border-red-500/20',
};

export function BrowserView() {
  const [sessions, setSessions] = useState<BrowserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // New session form
  const [newSessionUrl, setNewSessionUrl] = useState('');
  const [newSessionActions, setNewSessionActions] = useState<BrowserAction[]>([]);
  const [currentAction, setCurrentAction] = useState<BrowserAction>({ type: 'navigate' });

  // Scraper
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeMode, setScrapeMode] = useState<string>('full');
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Action log
  const [actionLog, setActionLog] = useState<Array<{ action: string; result: string; timestamp: number }>>([]);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await apiFetch<{ sessions: BrowserSession[] }>('/api/browser/sessions');
      setSessions(data.sessions || []);
    } catch {
      // Empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const createSession = async () => {
    if (!newSessionUrl.trim()) return;
    setIsProcessing(true);
    try {
      const data = await apiFetch<{ session: BrowserSession }>('/api/browser/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newSessionUrl,
          actions: newSessionActions,
        }),
      });
      setSessions((prev) => [data.session, ...prev]);
      setActiveSessionId(data.session.id);
      setNewSessionUrl('');
      setNewSessionActions([]);
    } catch {
      // Error
    } finally {
      setIsProcessing(false);
    }
  };

  const executeAction = async (sessionId: string, action: BrowserAction) => {
    setIsProcessing(true);
    try {
      const data = await apiFetch<{ result: { success: boolean; data?: unknown; error?: string; duration: number } }>(
        '/api/browser/execute',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, action }),
        }
      );
      setActionLog((prev) => [
        { action: action.type, result: data.result?.success ? 'Success' : `Failed: ${data.result?.error}`, timestamp: Date.now() },
        ...prev,
      ]);
      fetchSessions();
    } catch {
      setActionLog((prev) => [
        { action: action.type, result: 'Error executing action', timestamp: Date.now() },
        ...prev,
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const addActionToScript = () => {
    setNewSessionActions((prev) => [...prev, { ...currentAction }]);
  };

  const runScript = async (sessionId: string) => {
    if (newSessionActions.length === 0) return;
    setIsProcessing(true);
    try {
      await apiFetch('/api/browser/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, actions: newSessionActions, mode: 'script' }),
      });
      fetchSessions();
    } catch {
      // Error
    } finally {
      setIsProcessing(false);
    }
  };

  const scrapePage = async () => {
    if (!scrapeUrl.trim()) return;
    setIsProcessing(true);
    setScrapeResult(null);
    try {
      const data = await apiFetch<{ result: ScrapeResult }>('/api/browser/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl, mode: scrapeMode }),
      });
      setScrapeResult(data.result);
    } catch {
      // Error
    } finally {
      setIsProcessing(false);
    }
  };

  const searchWeb = async () => {
    if (!searchQuery.trim()) return;
    setIsProcessing(true);
    try {
      await apiFetch('/api/browser/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, mode: 'search' }),
      });
    } catch {
      // Error
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteSession = async (id: string) => {
    try {
      await apiFetch(`/api/browser/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) setActiveSessionId(null);
    } catch {
      // Error
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Web Actions & Browser Automation</h2>
        <p className="text-muted-foreground">Automate web navigation, extract data, and control browsers</p>
      </div>

      <Tabs defaultValue="automation" className="space-y-4">
        <TabsList>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="scraper">Web Scraper</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        {/* Automation Tab */}
        <TabsContent value="automation">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Session Setup */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">New Session</CardTitle>
                <CardDescription>Create a browser automation session</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Starting URL</Label>
                  <Input
                    placeholder="https://example.com"
                    value={newSessionUrl}
                    onChange={(e) => setNewSessionUrl(e.target.value)}
                  />
                </div>
                <Button onClick={createSession} disabled={!newSessionUrl.trim() || isProcessing} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Session
                </Button>

                <Separator />

                {/* Action Builder */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Add Action to Script</Label>
                  <Select
                    value={currentAction.type}
                    onValueChange={(v) => setCurrentAction({ ...currentAction, type: v as ActionType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="navigate">Navigate</SelectItem>
                      <SelectItem value="click">Click</SelectItem>
                      <SelectItem value="type">Type Text</SelectItem>
                      <SelectItem value="scroll">Scroll</SelectItem>
                      <SelectItem value="screenshot">Screenshot</SelectItem>
                      <SelectItem value="extract">Extract Data</SelectItem>
                      <SelectItem value="fill_form">Fill Form</SelectItem>
                      <SelectItem value="wait">Wait</SelectItem>
                    </SelectContent>
                  </Select>

                  {['click', 'type', 'extract', 'fill_form', 'scroll'].includes(currentAction.type) && (
                    <Input
                      placeholder="CSS Selector"
                      value={currentAction.selector || ''}
                      onChange={(e) => setCurrentAction({ ...currentAction, selector: e.target.value })}
                    />
                  )}

                  {['type', 'fill_form', 'navigate', 'wait'].includes(currentAction.type) && (
                    <Input
                      placeholder={currentAction.type === 'navigate' ? 'URL' : 'Value'}
                      value={currentAction.value || ''}
                      onChange={(e) => setCurrentAction({ ...currentAction, value: e.target.value })}
                    />
                  )}

                  <Button onClick={addActionToScript} variant="outline" size="sm" className="w-full">
                    <Plus className="h-3 w-3 mr-1" /> Add Action
                  </Button>
                </div>

                {/* Script Preview */}
                {newSessionActions.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Script ({newSessionActions.length} actions)</Label>
                    <ScrollArea className="max-h-40">
                      <div className="space-y-1">
                        {newSessionActions.map((action, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm p-1.5 rounded bg-muted/50">
                            <Badge variant="outline" className="text-xs">
                              {i + 1}
                            </Badge>
                            <span className="font-mono text-xs">{action.type}</span>
                            {action.selector && (
                              <span className="text-muted-foreground text-xs truncate">{action.selector}</span>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 ml-auto"
                              onClick={() =>
                                setNewSessionActions((prev) => prev.filter((_, idx) => idx !== i))
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Execution & Log */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Execution</CardTitle>
                  {activeSessionId && newSessionActions.length > 0 && (
                    <Button onClick={() => runScript(activeSessionId)} disabled={isProcessing} size="sm">
                      <Play className="h-3 w-3 mr-1" /> Run Script
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {actionLog.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Execute actions or run scripts to see results here</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-2">
                      {actionLog.map((log, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 text-sm"
                        >
                          <Badge variant="outline" className="text-xs font-mono">
                            {log.action}
                          </Badge>
                          <span className={log.result === 'Success' ? 'text-emerald-600' : 'text-red-500'}>
                            {log.result}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Scraper Tab */}
        <TabsContent value="scraper">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Web Scraper</CardTitle>
                <CardDescription>Extract content from web pages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>URL to Scrape</Label>
                  <Input
                    placeholder="https://example.com"
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scrape Mode</Label>
                  <Select value={scrapeMode} onValueChange={setScrapeMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Page</SelectItem>
                      <SelectItem value="article">Article Extraction</SelectItem>
                      <SelectItem value="products">Product Extraction</SelectItem>
                      <SelectItem value="structured">Structured Data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={scrapePage} disabled={!scrapeUrl.trim() || isProcessing} className="w-full">
                  {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                  Scrape Page
                </Button>

                <Separator />

                <div className="space-y-2">
                  <Label>Web Search</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search query..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Button onClick={searchWeb} disabled={!searchQuery.trim() || isProcessing} size="icon">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Results</CardTitle>
              </CardHeader>
              <CardContent>
                {scrapeResult ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-4 w-4" />
                      <span className="font-medium text-sm">{scrapeResult.title}</span>
                    </div>
                    <Badge variant="outline">{scrapeResult.url}</Badge>
                    <ScrollArea className="max-h-64">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{scrapeResult.content}</p>
                    </ScrollArea>
                    <div className="text-xs text-muted-foreground">
                      Processed in {scrapeResult.duration}ms
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Enter a URL and scrape to see results</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Globe className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No sessions yet. Create one to get started!</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-3">
                {sessions.map((session) => (
                  <Card key={session.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{session.url}</span>
                            <Badge className={STATUS_COLORS[session.status]} variant="outline">
                              {session.status}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Steps: {session.currentStep}/{session.stepCount}
                            {session.error && <span className="text-red-500 ml-2">{session.error}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setActiveSessionId(session.id);
                              if (session.status === 'running') {
                                executeAction(session.id, { type: 'screenshot' });
                              }
                            }}
                          >
                            <Camera className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteSession(session.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
