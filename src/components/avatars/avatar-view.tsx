'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  UserCircle,
  Plus,
  Play,
  Trash2,
  Mic,
  Smile,
  Loader2,
  MessageSquare,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';

type AvatarStyle = 'realistic' | 'cartoon' | 'anime' | 'abstract';
type AvatarExpression = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'thinking' | 'speaking' | 'listening' | 'wink' | 'laugh';

interface AvatarConfig {
  id: string;
  name: string;
  style: AvatarStyle;
  model: string;
  voiceId: string | null;
  isActive: boolean;
  thumbnailUrl: string | null;
  createdAt: string;
}

interface ChatMessage {
  role: 'user' | 'avatar';
  content: string;
  expression?: AvatarExpression;
  timestamp: number;
}

const EXPRESSION_ICONS: Record<AvatarExpression, string> = {
  neutral: '😐',
  happy: '😊',
  sad: '😢',
  angry: '😠',
  surprised: '😲',
  thinking: '🤔',
  speaking: '🗣️',
  listening: '👂',
  wink: '😉',
  laugh: '😂',
};

const STYLE_COLORS: Record<AvatarStyle, string> = {
  realistic: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  cartoon: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  anime: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  abstract: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
};

export function AvatarView() {
  const [avatars, setAvatars] = useState<AvatarConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarConfig | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [currentExpression, setCurrentExpression] = useState<AvatarExpression>('neutral');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAvatar, setNewAvatar] = useState({ name: '', style: 'realistic' as AvatarStyle });

  const fetchAvatars = useCallback(async () => {
    try {
      const data = await apiFetch<{ avatars: AvatarConfig[] }>('/api/avatars');
      setAvatars(data.avatars || []);
    } catch {
      // Use empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvatars();
  }, [fetchAvatars]);

  const createAvatar = async () => {
    if (!newAvatar.name.trim()) return;
    setIsProcessing(true);
    try {
      const data = await apiFetch<{ avatar: AvatarConfig }>('/api/avatars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAvatar),
      });
      setAvatars((prev) => [data.avatar, ...prev]);
      setCreateDialogOpen(false);
      setNewAvatar({ name: '', style: 'realistic' });
    } catch {
      // Error handling
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteAvatar = async (id: string) => {
    try {
      await apiFetch(`/api/avatars/${id}`, { method: 'DELETE' });
      setAvatars((prev) => prev.filter((a) => a.id !== id));
      if (selectedAvatar?.id === id) setSelectedAvatar(null);
    } catch {
      // Error handling
    }
  };

  const animateExpression = async (expression: AvatarExpression) => {
    if (!selectedAvatar) return;
    setCurrentExpression(expression);
    try {
      await apiFetch(`/api/avatars/${selectedAvatar.id}/animate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'expression', expression }),
      });
    } catch {
      // Error handling
    }
  };

  const generateImage = async () => {
    if (!selectedAvatar) return;
    setIsProcessing(true);
    try {
      const data = await apiFetch<{ thumbnailUrl: string }>(`/api/avatars/${selectedAvatar.id}/animate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'image', expression: currentExpression }),
      });
      if (data.thumbnailUrl) {
        setAvatars((prev) =>
          prev.map((a) => (a.id === selectedAvatar.id ? { ...a, thumbnailUrl: data.thumbnailUrl } : a))
        );
        setSelectedAvatar((prev) => (prev ? { ...prev, thumbnailUrl: data.thumbnailUrl } : prev));
      }
    } catch {
      // Error handling
    } finally {
      setIsProcessing(false);
    }
  };

  const startChat = async () => {
    if (!selectedAvatar) return;
    setIsProcessing(true);
    try {
      await apiFetch(`/api/avatars/${selectedAvatar.id}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      setIsSessionActive(true);
      setChatMessages([]);
    } catch {
      // Error handling
    } finally {
      setIsProcessing(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedAvatar || !chatInput.trim() || !isSessionActive) return;
    const userMsg: ChatMessage = { role: 'user', content: chatInput, timestamp: Date.now() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsProcessing(true);

    try {
      const data = await apiFetch<{ output: { text: string; expression: AvatarExpression } }>(
        `/api/avatars/${selectedAvatar.id}/session`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'input',
            input: { type: 'text', content: chatInput },
          }),
        }
      );
      const avatarMsg: ChatMessage = {
        role: 'avatar',
        content: data.output?.text || 'I received your message.',
        expression: data.output?.expression || 'neutral',
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, avatarMsg]);
      setCurrentExpression(data.output?.expression || 'neutral');
    } catch {
      const errorMsg: ChatMessage = {
        role: 'avatar',
        content: 'Sorry, I encountered an error. Please try again.',
        expression: 'sad',
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const endChat = async () => {
    if (!selectedAvatar) return;
    try {
      await apiFetch(`/api/avatars/${selectedAvatar.id}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end' }),
      });
    } catch {
      // Error handling
    }
    setIsSessionActive(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Visual AI Avatars</h2>
          <p className="text-muted-foreground">Create and interact with AI-powered talking avatars</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Avatar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Avatar</DialogTitle>
              <DialogDescription>Design your AI avatar with custom appearance and style</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="Enter avatar name..."
                  value={newAvatar.name}
                  onChange={(e) => setNewAvatar({ ...newAvatar, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Style</Label>
                <Select value={newAvatar.style} onValueChange={(v) => setNewAvatar({ ...newAvatar, style: v as AvatarStyle })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="realistic">Realistic</SelectItem>
                    <SelectItem value="cartoon">Cartoon</SelectItem>
                    <SelectItem value="anime">Anime</SelectItem>
                    <SelectItem value="abstract">Abstract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createAvatar} disabled={!newAvatar.name.trim() || isProcessing} className="w-full">
                {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Create Avatar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="gallery" className="space-y-4">
        <TabsList>
          <TabsTrigger value="gallery">Gallery</TabsTrigger>
          <TabsTrigger value="interact">Interact</TabsTrigger>
          <TabsTrigger value="animate">Animate</TabsTrigger>
        </TabsList>

        {/* Gallery Tab */}
        <TabsContent value="gallery">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : avatars.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <UserCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No avatars yet. Create one to get started!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {avatars.map((avatar) => (
                <Card
                  key={avatar.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedAvatar?.id === avatar.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedAvatar(avatar)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{avatar.name}</CardTitle>
                      <Badge className={STYLE_COLORS[avatar.style]} variant="outline">
                        {avatar.style}
                      </Badge>
                    </div>
                    <CardDescription>{avatar.model} model</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="aspect-square bg-muted/50 rounded-lg flex items-center justify-center mb-3 overflow-hidden">
                      {avatar.thumbnailUrl ? (
                        <img
                          src={avatar.thumbnailUrl}
                          alt={avatar.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <UserCircle className="h-16 w-16 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant={avatar.isActive ? 'default' : 'secondary'}>
                        {avatar.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteAvatar(avatar.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Interact Tab */}
        <TabsContent value="interact">
          {!selectedAvatar ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Select an avatar from the gallery first</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Avatar Display */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {selectedAvatar.name}
                    <span className="text-2xl">{EXPRESSION_ICONS[currentExpression]}</span>
                  </CardTitle>
                  <CardDescription>
                    {isSessionActive ? 'Session active' : 'Start a session to chat'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="aspect-square bg-muted/50 rounded-lg flex items-center justify-center overflow-hidden">
                    {selectedAvatar.thumbnailUrl ? (
                      <img
                        src={selectedAvatar.thumbnailUrl}
                        alt={selectedAvatar.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserCircle className="h-24 w-24 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    {!isSessionActive ? (
                      <Button onClick={startChat} disabled={isProcessing} className="flex-1">
                        <Play className="h-4 w-4 mr-2" />
                        Start Session
                      </Button>
                    ) : (
                      <Button onClick={endChat} variant="destructive" className="flex-1">
                        End Session
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Chat Panel */}
              <Card>
                <CardHeader>
                  <CardTitle>Chat</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-80 mb-4">
                    {chatMessages.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        Send a message to start talking with {selectedAvatar.name}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {chatMessages.map((msg, i) => (
                          <div
                            key={i}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg p-3 ${
                                msg.role === 'user'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                              }`}
                            >
                              {msg.role === 'avatar' && msg.expression && (
                                <span className="text-sm mr-1">{EXPRESSION_ICONS[msg.expression]}</span>
                              )}
                              <p className="text-sm">{msg.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                      disabled={!isSessionActive || isProcessing}
                    />
                    <Button onClick={sendMessage} disabled={!isSessionActive || !chatInput.trim() || isProcessing}>
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Animate Tab */}
        <TabsContent value="animate">
          {!selectedAvatar ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Smile className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Select an avatar from the gallery first</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Avatar Preview */}
              <Card>
                <CardHeader>
                  <CardTitle>Preview: {selectedAvatar.name}</CardTitle>
                  <CardDescription>Current expression: {currentExpression}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="aspect-square bg-muted/50 rounded-lg flex items-center justify-center overflow-hidden mb-4">
                    {selectedAvatar.thumbnailUrl ? (
                      <img
                        src={selectedAvatar.thumbnailUrl}
                        alt={selectedAvatar.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-6xl">{EXPRESSION_ICONS[currentExpression]}</div>
                    )}
                  </div>
                  <Button onClick={generateImage} disabled={isProcessing} className="w-full">
                    {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-2" />}
                    Generate Image
                  </Button>
                </CardContent>
              </Card>

              {/* Expression Controls */}
              <Card>
                <CardHeader>
                  <CardTitle>Expressions</CardTitle>
                  <CardDescription>Click an expression to animate the avatar</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.entries(EXPRESSION_ICONS) as [AvatarExpression, string][]).map(
                      ([expr, icon]) => (
                        <Button
                          key={expr}
                          variant={currentExpression === expr ? 'default' : 'outline'}
                          className="h-14 text-base justify-start gap-3"
                          onClick={() => animateExpression(expr)}
                        >
                          <span className="text-xl">{icon}</span>
                          <span className="capitalize">{expr}</span>
                        </Button>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
