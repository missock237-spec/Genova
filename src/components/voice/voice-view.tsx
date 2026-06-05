'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Phone,
  PhoneOff,
  Brain,
  History,
  Settings,
  AudioWaveform,
  Loader2,
  Play,
  Square,
  Trash2,
  Search,
  RefreshCw,
  Radio,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceProfile {
  id?: string;
  language: string;
  voiceModel: string;
  speed: number;
  pitch: number;
  volume: number;
  provider: string;
  isActive: boolean;
}

interface VoiceMemory {
  id: string;
  content: string;
  category: string;
  confidence: number;
  tags: string[];
  createdAt: string;
}

interface VoiceCall {
  id: string;
  status: string;
  fromNumber: string;
  toNumber: string;
  provider: string;
  startedAt: string;
  endedAt?: string;
}

interface VoiceSystemStatus {
  stt: { available: boolean; providers: string[] };
  tts: { available: boolean; providers: string[] };
  agent: { available: boolean };
  memory: { available: boolean };
  calls: { available: boolean; providers: string[] };
}

// ---------------------------------------------------------------------------
// Voice View Component
// ---------------------------------------------------------------------------

export function VoiceView() {
  const [activeTab, setActiveTab] = useState('agent');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voice AI</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Speech-to-text, text-to-speech, voice agents, and AI calls
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 px-3 py-1">
          <Radio className="h-3 w-3 text-emerald-500" />
          Voice System Active
        </Badge>
      </div>

      {/* System Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatusCard title="STT" icon={<Mic className="h-4 w-4" />} statusKey="stt" />
        <StatusCard title="TTS" icon={<Volume2 className="h-4 w-4" />} statusKey="tts" />
        <StatusCard title="Agent" icon={<Brain className="h-4 w-4" />} statusKey="agent" />
        <StatusCard title="Calls" icon={<Phone className="h-4 w-4" />} statusKey="calls" />
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="agent" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Agent</span>
          </TabsTrigger>
          <TabsTrigger value="stt" className="gap-1.5">
            <Mic className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">STT</span>
          </TabsTrigger>
          <TabsTrigger value="tts" className="gap-1.5">
            <Volume2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">TTS</span>
          </TabsTrigger>
          <TabsTrigger value="calls" className="gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Calls</span>
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Memory</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agent">
          <VoiceAgentTab />
        </TabsContent>
        <TabsContent value="stt">
          <STTTab />
        </TabsContent>
        <TabsContent value="tts">
          <TTSTab />
        </TabsContent>
        <TabsContent value="calls">
          <AICallsTab />
        </TabsContent>
        <TabsContent value="memory">
          <VoiceMemoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status Card
// ---------------------------------------------------------------------------

function StatusCard({ title, icon, statusKey }: { title: string; icon: React.ReactNode; statusKey: string }) {
  const [status, setStatus] = useState<{ available: boolean; providers: string[] } | null>(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        // Use the voice system status endpoint
        const data = await apiFetch<VoiceSystemStatus>('/api/voice/profile');
        // If we get here, at least the system is running
        setStatus({ available: true, providers: ['active'] });
      } catch {
        setStatus({ available: false, providers: [] });
      }
    }
    loadStatus();
  }, [statusKey]);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <div className={`p-2 rounded-lg ${status?.available !== false ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {status?.available !== false ? 'Available' : 'Checking...'}
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Voice Agent Tab
// ---------------------------------------------------------------------------

function VoiceAgentTab() {
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [loading, setLoading] = useState(false);
  const [textInput, setTextInput] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startSession = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ sessionId: string; status: string }>('/api/voice/agent', {
        method: 'POST',
        body: JSON.stringify({
          action: 'start',
          agentId: 'voice-assistant',
          language: 'en-US',
          enableInterruption: true,
          vadSensitivity: 'medium',
          responseDelayMs: 200,
        }),
      });
      setSessionId(data.sessionId);
      setAgentStatus('idle');
      setTranscript([]);
    } catch (error) {
      console.error('Failed to start voice session:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const endSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      await apiFetch('/api/voice/agent', {
        method: 'POST',
        body: JSON.stringify({ action: 'end', sessionId }),
      });
    } catch {
      // Ignore
    }
    setSessionId(null);
    setAgentStatus('idle');
    setIsRecording(false);
  }, [sessionId]);

  const sendTextMessage = useCallback(async () => {
    if (!textInput.trim() || !sessionId) return;

    const userMsg = { role: 'user' as const, content: textInput };
    setTranscript((prev) => [...prev, userMsg]);
    setTextInput('');
    setAgentStatus('thinking');

    try {
      // Use the AI chat endpoint for text-based interaction with voice agent context
      const data = await apiFetch<{ reply: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: textInput,
          history: transcript.map((m) => m),
        }),
      });

      const assistantMsg = { role: 'assistant' as const, content: data.reply };
      setTranscript((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg = { role: 'assistant' as const, content: 'Sorry, I encountered an error. Please try again.' };
      setTranscript((prev) => [...prev, errorMsg]);
    } finally {
      setAgentStatus('idle');
    }
  }, [textInput, sessionId, transcript]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          if (sessionId && base64Audio) {
            setAgentStatus('thinking');
            try {
              const data = await apiFetch<{ audio: string | null; status: string; transcript: Array<{ role: string; content: string }> }>('/api/voice/agent', {
                method: 'POST',
                body: JSON.stringify({
                  action: 'audio',
                  sessionId,
                  audio: base64Audio,
                }),
              });

              if (data.transcript?.length) {
                setTranscript(data.transcript.map((m) => ({
                  role: m.role as 'user' | 'assistant',
                  content: m.content,
                })));
              }

              // Play response audio if available
              if (data.audio) {
                const audioBuffer = Buffer.from(data.audio, 'base64');
                const blob = new Blob([audioBuffer], { type: 'audio/mp3' });
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                audio.play().catch(() => {});
              }

              setAgentStatus('idle');
            } catch {
              setAgentStatus('idle');
            }
          }
        };
        reader.readAsDataURL(audioBlob);

        // Clean up stream
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setAgentStatus('listening');
    } catch (error) {
      console.error('Microphone access denied:', error);
    }
  }, [isRecording, sessionId]);

  const statusColors: Record<string, string> = {
    idle: 'bg-muted text-muted-foreground',
    listening: 'bg-emerald-500/10 text-emerald-500',
    thinking: 'bg-amber-500/10 text-amber-500',
    speaking: 'bg-blue-500/10 text-blue-500',
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Conversation Panel */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Voice Agent</CardTitle>
              <CardDescription>Real-time voice conversation with AI</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={statusColors[agentStatus]}>
                {agentStatus === 'listening' && <Mic className="h-3 w-3 mr-1" />}
                {agentStatus === 'thinking' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {agentStatus === 'speaking' && <Volume2 className="h-3 w-3 mr-1" />}
                {agentStatus.charAt(0).toUpperCase() + agentStatus.slice(1)}
              </Badge>
              {!sessionId ? (
                <Button onClick={startSession} disabled={loading} size="sm">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  <span className="ml-1.5">Start</span>
                </Button>
              ) : (
                <Button onClick={endSession} variant="destructive" size="sm">
                  <Square className="h-4 w-4" />
                  <span className="ml-1.5">End</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Transcript */}
          <ScrollArea className="h-80 rounded-lg border bg-muted/30 p-4">
            {transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <AudioWaveform className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">Start a session and speak or type to begin</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transcript.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          {sessionId && (
            <div className="mt-4 flex gap-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendTextMessage()}
                placeholder="Type a message or use microphone..."
                className="flex-1"
              />
              <Button
                onClick={toggleRecording}
                variant={isRecording ? 'destructive' : 'default'}
                size="icon"
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button onClick={sendTextMessage} disabled={!textInput.trim()}>
                <Play className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Config Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <VoiceProfileEditor />

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Quick Stats</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-muted p-2">
                <p className="text-muted-foreground text-xs">Messages</p>
                <p className="font-semibold">{transcript.length}</p>
              </div>
              <div className="rounded-lg bg-muted p-2">
                <p className="text-muted-foreground text-xs">Session</p>
                <p className="font-semibold">{sessionId ? 'Active' : 'None'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// STT Tab
// ---------------------------------------------------------------------------

function STTTab() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [loading, setLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleTranscribe = useCallback(async () => {
    if (isRecording) {
      // Stop and transcribe
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();

        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          if (base64Audio) {
            setLoading(true);
            try {
              const data = await apiFetch<{ text: string; language: string; confidence: number; duration: number }>('/api/voice/stt', {
                method: 'POST',
                body: JSON.stringify({
                  audio: base64Audio,
                  language,
                }),
              });
              setTranscription(data.text);
            } catch (error) {
              setTranscription('Error: Failed to transcribe audio');
            } finally {
              setLoading(false);
            }
          }
        };

        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      console.error('Microphone access denied');
    }
  }, [isRecording, language]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Speech-to-Text
        </CardTitle>
        <CardDescription>Record audio and get real-time transcription</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en-US">English (US)</SelectItem>
              <SelectItem value="en-GB">English (UK)</SelectItem>
              <SelectItem value="fr-FR">French</SelectItem>
              <SelectItem value="de-DE">German</SelectItem>
              <SelectItem value="es-ES">Spanish</SelectItem>
              <SelectItem value="ja-JP">Japanese</SelectItem>
              <SelectItem value="zh-CN">Chinese</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleTranscribe}
            variant={isRecording ? 'destructive' : 'default'}
            size="lg"
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isRecording ? (
              <><MicOff className="h-5 w-5" /> Stop Recording</>
            ) : (
              <><Mic className="h-5 w-5" /> Start Recording</>
            )}
          </Button>
        </div>

        {isRecording && (
          <div className="flex items-center gap-2 text-sm text-emerald-500">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            Recording in progress...
          </div>
        )}

        <div>
          <Label className="text-sm font-medium">Transcription</Label>
          <Textarea
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            placeholder="Transcription will appear here..."
            className="mt-1.5 min-h-32"
            readOnly
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TTS Tab
// ---------------------------------------------------------------------------

function TTSTab() {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('alloy');
  const [speed, setSpeed] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSynthesize = useCallback(async () => {
    if (!text.trim()) return;

    setLoading(true);
    try {
      const data = await apiFetch<{ audio: string; duration: number; format: string; size: number }>('/api/voice/tts', {
        method: 'POST',
        body: JSON.stringify({
          text,
          voice,
          speed,
          responseFormat: 'mp3',
        }),
      });

      // Create audio blob and play
      const binaryString = atob(data.audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
    } catch (error) {
      console.error('TTS failed:', error);
    } finally {
      setLoading(false);
    }
  }, [text, voice, speed]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Text-to-Speech
        </CardTitle>
        <CardDescription>Convert text to natural-sounding speech</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-sm font-medium">Text</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter text to synthesize..."
            className="mt-1.5 min-h-24"
            maxLength={4096}
          />
          <p className="text-xs text-muted-foreground mt-1">{text.length}/4096</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium">Voice</Label>
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alloy">Alloy</SelectItem>
                <SelectItem value="echo">Echo</SelectItem>
                <SelectItem value="fable">Fable</SelectItem>
                <SelectItem value="onyx">Onyx</SelectItem>
                <SelectItem value="nova">Nova</SelectItem>
                <SelectItem value="shimmer">Shimmer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium">Speed: {speed.toFixed(1)}x</Label>
            <Slider
              value={[speed]}
              onValueChange={([v]) => setSpeed(v)}
              min={0.25}
              max={4.0}
              step={0.25}
              className="mt-3"
            />
          </div>
        </div>

        <Button onClick={handleSynthesize} disabled={!text.trim() || loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
          Synthesize Speech
        </Button>

        {audioUrl && (
          <div className="rounded-lg border p-3">
            <audio ref={audioRef} controls className="w-full" src={audioUrl} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AI Calls Tab
// ---------------------------------------------------------------------------

function AICallsTab() {
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [initiating, setInitiating] = useState(false);
  const [callForm, setCallForm] = useState({
    provider: 'twilio',
    fromNumber: '',
    toNumber: '',
    language: 'en-US',
  });

  const loadCalls = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ calls: VoiceCall[]; total: number }>('/api/voice/calls');
      setCalls(data.calls);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  const initiateCall = useCallback(async () => {
    if (!callForm.fromNumber || !callForm.toNumber) return;
    setInitiating(true);
    try {
      await apiFetch('/api/voice/calls', {
        method: 'POST',
        body: JSON.stringify(callForm),
      });
      await loadCalls();
    } catch (error) {
      console.error('Failed to initiate call:', error);
    } finally {
      setInitiating(false);
    }
  }, [callForm, loadCalls]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Initiate Call */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Initiate AI Call
          </CardTitle>
          <CardDescription>Start an AI-powered phone call</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Provider</Label>
            <Select
              value={callForm.provider}
              onValueChange={(v) => setCallForm((p) => ({ ...p, provider: v }))}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="twilio">Twilio</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium">From Number</Label>
            <Input
              value={callForm.fromNumber}
              onChange={(e) => setCallForm((p) => ({ ...p, fromNumber: e.target.value }))}
              placeholder="+1234567890"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">To Number</Label>
            <Input
              value={callForm.toNumber}
              onChange={(e) => setCallForm((p) => ({ ...p, toNumber: e.target.value }))}
              placeholder="+0987654321"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Language</Label>
            <Select
              value={callForm.language}
              onValueChange={(v) => setCallForm((p) => ({ ...p, language: v }))}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en-US">English</SelectItem>
                <SelectItem value="fr-FR">French</SelectItem>
                <SelectItem value="es-ES">Spanish</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={initiateCall}
            disabled={!callForm.fromNumber || !callForm.toNumber || initiating}
            className="w-full gap-2"
          >
            {initiating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
            Initiate Call
          </Button>
        </CardContent>
      </Card>

      {/* Call History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Call History</CardTitle>
            <Button variant="ghost" size="icon" onClick={loadCalls} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-80">
            {calls.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                <PhoneOff className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">No calls yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {calls.map((call) => (
                  <div key={call.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{call.toNumber}</span>
                      <Badge variant={call.status === 'ended' ? 'secondary' : call.status === 'failed' ? 'destructive' : 'default'}>
                        {call.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{call.provider}</span>
                      <span>•</span>
                      <span>{new Date(call.startedAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice Memory Tab
// ---------------------------------------------------------------------------

function VoiceMemoryTab() {
  const [memories, setMemories] = useState<VoiceMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('all');

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (category !== 'all') params.category = category;
      const data = await apiFetch<{ memories: VoiceMemory[]; total: number }>('/api/voice/memory', { params });
      setMemories(data.memories);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [category]);

  const searchMemories = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadMemories();
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{ memories: VoiceMemory[]; query: string }>('/api/voice/memory', {
        params: { q: searchQuery },
      });
      setMemories(data.memories);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [searchQuery, loadMemories]);

  const deleteMemory = useCallback(async (id: string) => {
    try {
      await apiFetch(`/api/voice/memory?id=${id}`, { method: 'DELETE' });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const categoryColors: Record<string, string> = {
    preference: 'bg-purple-500/10 text-purple-500',
    conversation: 'bg-blue-500/10 text-blue-500',
    command: 'bg-amber-500/10 text-amber-500',
    emotion: 'bg-rose-500/10 text-rose-500',
    general: 'bg-muted text-muted-foreground',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" />
              Voice Memory
            </CardTitle>
            <CardDescription>Browse and search your voice interaction history</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={loadMemories} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search & Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchMemories()}
              placeholder="Search memories..."
              className="pl-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="preference">Preferences</SelectItem>
              <SelectItem value="conversation">Conversations</SelectItem>
              <SelectItem value="command">Commands</SelectItem>
              <SelectItem value="emotion">Emotions</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Memory List */}
        <ScrollArea className="h-96">
          {memories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
              <Brain className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">No voice memories found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {memories.map((memory) => (
                <div key={memory.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className={categoryColors[memory.category] || categoryColors.general}>
                      {memory.category}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMemory(memory.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-sm leading-relaxed">{memory.content}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Confidence: {(memory.confidence * 100).toFixed(0)}%</span>
                    <span>•</span>
                    <span>{new Date(memory.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Voice Profile Editor
// ---------------------------------------------------------------------------

function VoiceProfileEditor() {
  const [profile, setProfile] = useState<VoiceProfile>({
    language: 'en-US',
    voiceModel: 'alloy',
    speed: 1.0,
    pitch: 1.0,
    volume: 1.0,
    provider: 'openai',
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<VoiceProfile>('/api/voice/profile');
        setProfile(data);
      } catch {
        // Use defaults
      }
    }
    load();
  }, []);

  const saveProfile = useCallback(async () => {
    setSaving(true);
    try {
      await apiFetch('/api/voice/profile', {
        method: 'PUT',
        body: JSON.stringify(profile),
      });
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  }, [profile]);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Voice Profile</h4>

      <div>
        <Label className="text-xs">Voice</Label>
        <Select
          value={profile.voiceModel}
          onValueChange={(v) => setProfile((p) => ({ ...p, voiceModel: v }))}
        >
          <SelectTrigger className="mt-1 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alloy">Alloy</SelectItem>
            <SelectItem value="echo">Echo</SelectItem>
            <SelectItem value="fable">Fable</SelectItem>
            <SelectItem value="onyx">Onyx</SelectItem>
            <SelectItem value="nova">Nova</SelectItem>
            <SelectItem value="shimmer">Shimmer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Speed: {profile.speed.toFixed(1)}x</Label>
        <Slider
          value={[profile.speed]}
          onValueChange={([v]) => setProfile((p) => ({ ...p, speed: v }))}
          min={0.25}
          max={4.0}
          step={0.25}
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-xs">Language</Label>
        <Select
          value={profile.language}
          onValueChange={(v) => setProfile((p) => ({ ...p, language: v }))}
        >
          <SelectTrigger className="mt-1 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en-US">English (US)</SelectItem>
            <SelectItem value="en-GB">English (UK)</SelectItem>
            <SelectItem value="fr-FR">French</SelectItem>
            <SelectItem value="de-DE">German</SelectItem>
            <SelectItem value="es-ES">Spanish</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={saveProfile} disabled={saving} size="sm" className="w-full gap-1.5">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Settings className="h-3.5 w-3.5" />}
        Save Profile
      </Button>
    </div>
  );
}
