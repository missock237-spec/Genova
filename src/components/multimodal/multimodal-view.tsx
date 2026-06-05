'use client';

import { useState, useCallback } from 'react';
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
  Eye,
  Camera,
  Monitor,
  Video,
  Loader2,
  Upload,
  ScanFace,
  Smile,
  Hand,
  Fingerprint,
  Search,
  Image as ImageIcon,
  ArrowLeftRight,
} from 'lucide-react';

interface VisionResult {
  description: string;
  objects: Array<{ label: string; confidence: number; category: string }>;
  text: { fullText: string; language: string; confidence: number };
  scene: { setting: string; lighting: string; mood: string; activities: string[] };
  tags: string[];
  confidence: number;
  processingTime: number;
}

interface ScreenResult {
  description: string;
  uiElements: Array<{ type: string; label: string; clickable: boolean; state: string }>;
  changes: Array<{ type: string; description: string; confidence: number }>;
  suggestedActions: Array<{ action: string; target: string; description: string; confidence: number; category: string }>;
  processingTime: number;
}

interface WebcamResult {
  faces: Array<{ id: string; confidence: number; age?: { min: number; max: number }; pose?: { yaw: number; pitch: number } }>;
  emotions: Array<{ dominant: string; valence: number; arousal: number }>;
  gestures: Array<{ type: string; confidence: number; description: string }>;
  personCount: number;
  attention: { focused: boolean; direction: string; engagementScore: number };
  processingTime: number;
}

const EMOTION_COLORS: Record<string, string> = {
  happy: 'text-emerald-600',
  neutral: 'text-slate-600',
  surprised: 'text-amber-600',
  sad: 'text-blue-600',
  angry: 'text-red-600',
  fearful: 'text-purple-600',
};

export function MultimodalView() {
  const [isProcessing, setIsProcessing] = useState(false);

  // Vision state
  const [visionImage, setVisionImage] = useState('');
  const [visionResult, setVisionResult] = useState<VisionResult | null>(null);
  const [compareImage1, setCompareImage1] = useState('');
  const [compareImage2, setCompareImage2] = useState('');

  // Screen share state
  const [screenImageData, setScreenImageData] = useState('');
  const [screenResult, setScreenResult] = useState<ScreenResult | null>(null);

  // Webcam state
  const [webcamResult, setWebcamResult] = useState<WebcamResult | null>(null);
  const [webcamActive, setWebcamActive] = useState(false);

  const analyzeImage = async () => {
    if (!visionImage.trim()) return;
    setIsProcessing(true);
    try {
      const data = await apiFetch<{ result: VisionResult }>('/api/multimodal/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: visionImage }),
      });
      setVisionResult(data.result);
    } catch {
      // Error
    } finally {
      setIsProcessing(false);
    }
  };

  const processScreenFrame = async () => {
    if (!screenImageData.trim()) return;
    setIsProcessing(true);
    try {
      const data = await apiFetch<{ result: ScreenResult }>('/api/multimodal/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: screenImageData }),
      });
      setScreenResult(data.result);
    } catch {
      // Error
    } finally {
      setIsProcessing(false);
    }
  };

  const processWebcamFrame = async () => {
    setIsProcessing(true);
    try {
      // Simulate webcam frame
      const data = await apiFetch<{ result: WebcamResult }>('/api/multimodal/webcam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: 'webcam-frame-placeholder',
          width: 640,
          height: 480,
        }),
      });
      setWebcamResult(data.result);
    } catch {
      // Error
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (setter: (v: string) => void) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setter(result.split(',')[1] || result); // Remove data:xxx;base64, prefix
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Real-time Multimodal</h2>
        <p className="text-muted-foreground">AI-powered vision, webcam, and screen analysis</p>
      </div>

      <Tabs defaultValue="vision" className="space-y-4">
        <TabsList>
          <TabsTrigger value="vision" className="gap-2">
            <Eye className="h-4 w-4" /> Vision
          </TabsTrigger>
          <TabsTrigger value="screen" className="gap-2">
            <Monitor className="h-4 w-4" /> Screen Share
          </TabsTrigger>
          <TabsTrigger value="webcam" className="gap-2">
            <Video className="h-4 w-4" /> Webcam
          </TabsTrigger>
        </TabsList>

        {/* Vision Tab */}
        <TabsContent value="vision">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Image Analysis</CardTitle>
                <CardDescription>Upload or paste an image for AI analysis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Image URL or Base64</Label>
                  <Textarea
                    placeholder="Paste image URL or base64 data..."
                    value={visionImage}
                    onChange={(e) => setVisionImage(e.target.value)}
                    className="min-h-24"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-sm">Or upload:</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload(setVisionImage)}
                    className="max-w-xs"
                  />
                </div>

                <Button onClick={analyzeImage} disabled={!visionImage.trim() || isProcessing} className="w-full">
                  {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                  Analyze Image
                </Button>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Compare Images</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Image 1 URL" value={compareImage1} onChange={(e) => setCompareImage1(e.target.value)} />
                    <Input placeholder="Image 2 URL" value={compareImage2} onChange={(e) => setCompareImage2(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" className="w-full" disabled={!compareImage1 || !compareImage2}>
                    <ArrowLeftRight className="h-3 w-3 mr-1" /> Compare
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Analysis Results</CardTitle>
              </CardHeader>
              <CardContent>
                {visionResult ? (
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Description</Label>
                        <p className="text-sm text-muted-foreground mt-1">{visionResult.description}</p>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Detected Objects ({visionResult.objects.length})</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {visionResult.objects.map((obj, i) => (
                            <Badge key={i} variant="outline">
                              {obj.label} ({Math.round(obj.confidence * 100)}%)
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {visionResult.text.fullText && (
                        <div>
                          <Label className="text-sm font-medium">Extracted Text</Label>
                          <p className="text-sm text-muted-foreground mt-1 bg-muted/50 p-2 rounded">
                            {visionResult.text.fullText}
                          </p>
                        </div>
                      )}

                      <div>
                        <Label className="text-sm font-medium">Scene</Label>
                        <div className="grid grid-cols-2 gap-2 mt-1 text-sm">
                          <div>Setting: <span className="text-muted-foreground">{visionResult.scene.setting}</span></div>
                          <div>Lighting: <span className="text-muted-foreground">{visionResult.scene.lighting}</span></div>
                          <div>Mood: <span className="text-muted-foreground">{visionResult.scene.mood}</span></div>
                          <div>Activities: <span className="text-muted-foreground">{visionResult.scene.activities.join(', ')}</span></div>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Tags</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {visionResult.tags.map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Confidence: {Math.round(visionResult.confidence * 100)}% • Processed in {visionResult.processingTime}ms
                      </div>
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center text-muted-foreground py-12">
                    <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>Upload an image to analyze</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Screen Share Tab */}
        <TabsContent value="screen">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Screen Capture</CardTitle>
                <CardDescription>Process screen frames for AI understanding</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Screen Frame (Base64)</Label>
                  <Textarea
                    placeholder="Paste screen capture data..."
                    value={screenImageData}
                    onChange={(e) => setScreenImageData(e.target.value)}
                    className="min-h-24"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Or upload:</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload(setScreenImageData)}
                    className="max-w-xs"
                  />
                </div>
                <Button onClick={processScreenFrame} disabled={!screenImageData.trim() || isProcessing} className="w-full">
                  {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Monitor className="h-4 w-4 mr-2" />}
                  Process Frame
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Screen Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                {screenResult ? (
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Description</Label>
                        <p className="text-sm text-muted-foreground mt-1">{screenResult.description}</p>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">UI Elements ({screenResult.uiElements.length})</Label>
                        <div className="space-y-1 mt-1">
                          {screenResult.uiElements.map((el, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <Badge variant="outline" className="text-xs">{el.type}</Badge>
                              <span>{el.label}</span>
                              {el.clickable && <Badge variant="secondary" className="text-xs">clickable</Badge>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {screenResult.suggestedActions.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium">Suggested Actions</Label>
                          <div className="space-y-1 mt-1">
                            {screenResult.suggestedActions.map((action, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm p-1.5 rounded bg-muted/50">
                                <Badge variant="outline" className="text-xs">{action.category}</Badge>
                                <span>{action.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground">
                        Processed in {screenResult.processingTime}ms
                      </div>
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center text-muted-foreground py-12">
                    <Monitor className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>Capture a screen frame to analyze</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Webcam Tab */}
        <TabsContent value="webcam">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Webcam Analysis</CardTitle>
                <CardDescription>Real-time face detection, emotion recognition, and gesture detection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="aspect-video bg-muted/50 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Video className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {webcamActive ? 'Webcam active' : 'Webcam preview'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setWebcamActive(!webcamActive);
                      processWebcamFrame();
                    }}
                    className="flex-1"
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : webcamActive ? (
                      <Camera className="h-4 w-4 mr-2" />
                    ) : (
                      <Video className="h-4 w-4 mr-2" />
                    )}
                    {webcamActive ? 'Capture Frame' : 'Start Webcam'}
                  </Button>
                  {webcamActive && (
                    <Button variant="outline" onClick={() => setWebcamActive(false)}>
                      Stop
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detection Results</CardTitle>
              </CardHeader>
              <CardContent>
                {webcamResult ? (
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Faces Detected: {webcamResult.personCount}</Label>
                        <div className="space-y-1 mt-1">
                          {webcamResult.faces.map((face, i) => (
                            <div key={face.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50">
                              <ScanFace className="h-4 w-4" />
                              <span>Face {i + 1}</span>
                              <Badge variant="outline" className="text-xs">
                                {Math.round(face.confidence * 100)}% confidence
                              </Badge>
                              {face.age && (
                                <span className="text-xs text-muted-foreground">
                                  Age: {face.age.min}-{face.age.max}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Emotions</Label>
                        <div className="space-y-2 mt-1">
                          {webcamResult.emotions.map((emo, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Smile className="h-4 w-4" />
                                <span className={`font-medium text-sm ${EMOTION_COLORS[emo.dominant] || ''}`}>
                                  {emo.dominant}
                                </span>
                              </div>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>Valence: {emo.valence.toFixed(2)}</span>
                                <span>Arousal: {emo.arousal.toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {webcamResult.gestures.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium">Gestures</Label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {webcamResult.gestures.map((g, i) => (
                              <Badge key={i} variant="outline" className="gap-1">
                                <Hand className="h-3 w-3" />
                                {g.type} ({Math.round(g.confidence * 100)}%)
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <Label className="text-sm font-medium">Attention</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Fingerprint className="h-4 w-4" />
                          <Badge variant={webcamResult.attention.focused ? 'default' : 'secondary'}>
                            {webcamResult.attention.focused ? 'Focused' : 'Distracted'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Direction: {webcamResult.attention.direction} •
                            Engagement: {Math.round(webcamResult.attention.engagementScore * 100)}%
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Processed in {webcamResult.processingTime}ms
                      </div>
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center text-muted-foreground py-12">
                    <ScanFace className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>Start the webcam to see detection results</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
