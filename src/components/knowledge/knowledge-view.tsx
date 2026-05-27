'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Upload,
  Search,
  FileText,
  Trash2,
  Plus,
  Loader2,
  Brain,
  Database,
  Tag,
  AlertCircle,
  CheckCircle2,
  File,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';

interface Document {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: string;
  chunkCount: number;
  createdAt: string;
}

interface KnowledgeEntry {
  id: string;
  content: string;
  category: string;
  tags: string[];
  source: string;
  relevance: number;
  userId: string;
  createdAt: string;
}

interface SearchResult {
  content: string;
  source: string;
  score: number;
  category?: string;
}

export function KnowledgeView() {
  const { user } = useAuthStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newEntry, setNewEntry] = useState({ content: '', category: 'project', tags: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState('documents');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadDocuments = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch('/api/rag/documents', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {
      // ignore
    }
  }, [user?.id]);

  const loadKnowledge = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch('/api/knowledge', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setKnowledge(data.entries || []);
      }
    } catch {
      // ignore
    }
  }, [user?.id]);

  // Load data on mount
  useState(() => {
    loadDocuments();
    loadKnowledge();
  });

  const handleUpload = async (files: FileList | null) => {
    if (!files || !user?.id) return;
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/rag/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Erreur d\'upload');
        }
      }

      await loadDocuments();
      await loadKnowledge();
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !user?.id) return;
    setLoading(true);

    try {
      const res = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: searchQuery, topK: 5 }),
      });

      if (res.ok) {
        const data = await res.json();
        const combined: SearchResult[] = [
          ...(data.chunks || []).map((c: { content: string; source: string; score: number }) => ({
            content: c.content,
            source: c.source,
            score: c.score,
            category: 'document',
          })),
          ...(data.knowledge || []).map((k: { content: string; category: string; source: string; relevance: number }) => ({
            content: k.content,
            source: k.source,
            score: k.relevance,
            category: k.category,
          })),
        ];
        combined.sort((a, b) => b.score - a.score);
        setSearchResults(combined);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleAddKnowledge = async () => {
    if (!newEntry.content.trim() || !user?.id) return;

    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          content: newEntry.content,
          category: newEntry.category,
          tags: newEntry.tags.split(',').map(t => t.trim()).filter(Boolean),
          source: 'manual',
          relevance: 0.7,
        }),
      });

      if (res.ok) {
        setNewEntry({ content: '', category: 'project', tags: '' });
        setShowAddForm(false);
        await loadKnowledge();
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    try {
      await fetch(`/api/knowledge?id=${id}`, { method: 'DELETE', credentials: 'include' });
      await loadKnowledge();
    } catch {
      // ignore
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf': return '📄';
      case 'txt': return '📝';
      case 'md': return '📋';
      case 'csv': return '📊';
      case 'json': return '🔧';
      default: return '📁';
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      preference: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
      project: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
      document: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
      workflow_context: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
      agent_learning: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    };
    return colors[category] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-500" />
            Base de connaissances
          </h2>
          <p className="text-sm text-muted-foreground">
            Gérez vos documents et connaissances pour enrichir vos agents IA
          </p>
        </div>
        <Button
          onClick={() => setShowAddForm(true)}
          size="sm"
          className="gap-1 bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Rechercher dans la base de connaissances..."
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading || !searchQuery.trim()} className="gap-1">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Chercher
        </Button>
      </div>

      {/* Search results */}
      <AnimatePresence>
        {searchResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Search className="h-3.5 w-3.5 text-emerald-500" />
                    Résultats de recherche ({searchResults.length})
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSearchResults([])}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  {searchResults.map((result, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-2 rounded-lg bg-background/50 border border-border/50 text-sm"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[9px] h-4">
                          {result.category || 'document'}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          Pertinence: {Math.round(result.score * 100)}%
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {result.source}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">{result.content}</p>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add knowledge form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <Card className="border-emerald-500/20">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="h-3.5 w-3.5 text-emerald-500" />
                    Ajouter une connaissance
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6" onClick={() => setShowAddForm(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-3">
                <Textarea
                  value={newEntry.content}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Entrez la connaissance à stocker..."
                  rows={3}
                />
                <div className="flex gap-2">
                  <select
                    value={newEntry.category}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, category: e.target.value }))}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="project">Projet</option>
                    <option value="preference">Préférence</option>
                    <option value="document">Document</option>
                    <option value="workflow_context">Contexte workflow</option>
                    <option value="agent_learning">Apprentissage agent</option>
                  </select>
                  <Input
                    value={newEntry.tags}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder="Tags (séparés par virgules)"
                    className="flex-1"
                  />
                  <Button onClick={handleAddKnowledge} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    Enregistrer
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit mb-3">
          <TabsTrigger value="documents" className="gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" /> Documents
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-1.5 text-xs">
            <Brain className="h-3.5 w-3.5" /> Connaissances
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="flex-1 min-h-0 mt-0">
          {/* Upload area */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center mb-4 transition-colors cursor-pointer ${
              dragOver
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-border hover:border-emerald-500/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleUpload(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.md,.csv,.json"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
                <p className="text-sm text-muted-foreground">Traitement en cours...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-emerald-500/50" />
                <p className="text-sm font-medium">
                  Glissez-déposez vos fichiers ici
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, TXT, Markdown, CSV, JSON — Max 10 Mo
                </p>
              </div>
            )}
          </div>

          {/* Documents list */}
          <div className="space-y-2 max-h-[calc(100vh-32rem)] overflow-y-auto custom-scrollbar">
            {documents.length === 0 ? (
              <div className="text-center py-8">
                <File className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Aucun document uploadé</p>
                <p className="text-xs text-muted-foreground">Uploadez des fichiers pour enrichir vos agents IA</p>
              </div>
            ) : (
              documents.map((doc, i) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="hover:border-emerald-500/30 transition-colors">
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className="text-2xl">{getFileIcon(doc.fileType)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.fileName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {formatFileSize(doc.fileSize)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {doc.chunkCount} fragment{doc.chunkCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          doc.status === 'ready'
                            ? 'text-emerald-600 border-emerald-500/20'
                            : doc.status === 'error'
                            ? 'text-red-600 border-red-500/20'
                            : 'text-amber-600 border-amber-500/20'
                        }
                      >
                        {doc.status === 'ready' ? (
                          <><CheckCircle2 className="h-3 w-3 mr-1" /> Prêt</>
                        ) : doc.status === 'error' ? (
                          <><AlertCircle className="h-3 w-3 mr-1" /> Erreur</>
                        ) : (
                          <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Traitement</>
                        )}
                      </Badge>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="knowledge" className="flex-1 min-h-0 mt-0">
          <div className="space-y-2 max-h-[calc(100vh-28rem)] overflow-y-auto custom-scrollbar">
            {knowledge.length === 0 ? (
              <div className="text-center py-8">
                <Database className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Aucune connaissance stockée</p>
                <p className="text-xs text-muted-foreground">
                  Ajoutez des connaissances manuellement ou uploadez des documents
                </p>
              </div>
            ) : (
              knowledge.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="hover:border-emerald-500/30 transition-colors">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm line-clamp-2">{entry.content}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="outline" className={`text-[9px] h-4 ${getCategoryColor(entry.category)}`}>
                              {entry.category}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] h-4">
                              <Tag className="h-2.5 w-2.5 mr-0.5" /> {entry.source}
                            </Badge>
                            {entry.tags.slice(0, 3).map((tag, ti) => (
                              <Badge key={ti} variant="secondary" className="text-[9px] h-4">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteKnowledge(entry.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
