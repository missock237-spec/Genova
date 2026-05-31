'use client';

/**
 * Integrations View — Genova SaaS
 *
 * Main dashboard for managing open-source integrations.
 * Shows all registered integrations, their status, and allows
 * scanning, activating, and executing integration functions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Plus, Search, Filter, Activity, CheckCircle2,
  XCircle, AlertTriangle, Loader2, Play, Pause, Trash2,
  ExternalLink, Settings, Zap, Package, Globe, ChevronDown,
  ChevronRight, Scan, Power, PowerOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

// ============================================================
// Types
// ============================================================

interface IntegrationFunction {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  requiresAuth: boolean;
  timeoutMs: number;
  costPerCall: number;
}

interface IntegrationConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  category: string;
  icon: string;
  color: string;
  homepage: string;
  repository: string;
  status: 'discovered' | 'installing' | 'active' | 'inactive' | 'error' | 'updating';
  functions: IntegrationFunction[];
  dependencies: string[];
  envVariables: { name: string; description: string; required: boolean; isSecret: boolean }[];
  health?: {
    healthy: boolean;
    responseTimeMs: number;
    error?: string;
  };
  error?: string;
}

interface IntegrationStats {
  total: number;
  active: number;
  inactive: number;
  error: number;
  discovered: number;
  categories: number;
  totalFunctions: number;
}

// ============================================================
// Status Helpers
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  discovered: { label: 'Découvert', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: <Package className="w-3 h-3" /> },
  installing: { label: 'Installation', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  active: { label: 'Actif', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
  inactive: { label: 'Inactif', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: <Pause className="w-3 h-3" /> },
  error: { label: 'Erreur', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <XCircle className="w-3 h-3" /> },
  updating: { label: 'Mise à jour', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: <RefreshCw className="w-3 h-3 animate-spin" /> },
};

const CATEGORY_LABELS: Record<string, string> = {
  ai_ml: 'IA / ML',
  communication: 'Communication',
  automation: 'Automatisation',
  database: 'Base de données',
  media: 'Média',
  infrastructure: 'Infrastructure',
  analytics: 'Analytique',
  other: 'Autre',
};

// ============================================================
// Integration Card
// ============================================================

function IntegrationCard({
  integration,
  onActivate,
  onDeactivate,
  onHealthCheck,
  onExecute,
}: {
  integration: IntegrationConfig;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onHealthCheck: (id: string) => void;
  onExecute: (id: string, func: IntegrationFunction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusConfig = STATUS_CONFIG[integration.status] || STATUS_CONFIG.discovered;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <Card className="bg-[#0d0d1a] border-[#2a2a4a] hover:border-[#3a3a5a] transition-all">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                style={{ backgroundColor: `${integration.color}20` }}
              >
                {integration.icon}
              </div>
              <div>
                <CardTitle className="text-white text-base">{integration.displayName}</CardTitle>
                <CardDescription className="text-gray-400 text-xs mt-0.5">
                  {CATEGORY_LABELS[integration.category] || integration.category} • v{integration.version}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={statusConfig.color}>
                {statusConfig.icon}
                <span className="ml-1">{statusConfig.label}</span>
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-gray-400 text-sm mb-3 line-clamp-2">{integration.description}</p>

          <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {integration.functions.length} fonctions
            </span>
            {integration.health && (
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {integration.health.responseTimeMs}ms
              </span>
            )}
            {integration.repository && (
              <a
                href={integration.repository}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-white transition-colors"
              >
                <Globe className="w-3 h-3" />
                Repo
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            {integration.status === 'active' ? (
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => onDeactivate(integration.id)}
              >
                <PowerOff className="w-3 h-3 mr-1" />
                Désactiver
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => onActivate(integration.id)}
              >
                <Power className="w-3 h-3 mr-1" />
                Activer
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="border-[#2a2a4a] text-gray-400 hover:text-white"
              onClick={() => onHealthCheck(integration.id)}
            >
              <Activity className="w-3 h-3 mr-1" />
              Vérifier
            </Button>
          </div>

          {/* Expanded: Functions List */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <Separator className="my-3 bg-[#2a2a4a]" />
                <h4 className="text-sm font-medium text-gray-300 mb-2">Fonctions disponibles</h4>
                <div className="space-y-2">
                  {integration.functions.map((func) => (
                    <div
                      key={func.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-[#1a1a2e] border border-[#2a2a4a]"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-medium">{func.displayName}</span>
                          {func.requiresAuth && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-yellow-500/30 text-yellow-400">
                              Auth
                            </Badge>
                          )}
                          {func.costPerCall > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-500/30 text-green-400">
                              ${func.costPerCall}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{func.description}</p>
                      </div>
                      {integration.status === 'active' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-blue-400 hover:text-blue-300 ml-2"
                          onClick={() => onExecute(integration.id, func)}
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {integration.envVariables.length > 0 && (
                  <>
                    <Separator className="my-3 bg-[#2a2a4a]" />
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Variables d&apos;environnement</h4>
                    <div className="space-y-1">
                      {integration.envVariables.map((env) => (
                        <div key={env.name} className="flex items-center gap-2 text-xs">
                          <code className="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            {env.name}
                          </code>
                          {env.required && <Badge variant="outline" className="text-[10px] px-1 py-0 border-red-500/30 text-red-400">Requis</Badge>}
                          {env.isSecret && <Badge variant="outline" className="text-[10px] px-1 py-0 border-yellow-500/30 text-yellow-400">Secret</Badge>}
                          <span className="text-gray-500">{env.description}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {integration.error && (
                  <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {integration.error}
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ============================================================
// Scan Dialog
// ============================================================

function ScanDialog({ onScan }: { onScan: (data: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [readmeContent, setReadmeContent] = useState('');
  const [repository, setRepository] = useState('');
  const [keywords, setKeywords] = useState('');
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    if (!projectName) return;
    setScanning(true);
    try {
      onScan({
        projectName,
        readmeContent,
        repository,
        keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
      });
      setOpen(false);
      setProjectName('');
      setReadmeContent('');
      setRepository('');
      setKeywords('');
    } finally {
      setScanning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <Scan className="w-4 h-4 mr-2" />
          Scanner un projet
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0d0d1a] border-[#2a2a4a] text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Scanner un projet open-source</DialogTitle>
          <DialogDescription className="text-gray-400">
            Analysez un projet open-source pour détecter ses fonctions et l&apos;intégrer dans Genova
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm text-gray-300 mb-1 block">Nom du projet *</label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="ex: SpeechBrain, Baileys, ComfyUI..."
              className="bg-[#1a1a2e] border-[#2a2a4a] text-white"
            />
          </div>
          <div>
            <label className="text-sm text-gray-300 mb-1 block">Dépôt GitHub</label>
            <Input
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              placeholder="https://github.com/..."
              className="bg-[#1a1a2e] border-[#2a2a4a] text-white"
            />
          </div>
          <div>
            <label className="text-sm text-gray-300 mb-1 block">Mots-clés (séparés par virgules)</label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="speech, ai, nlp, whatsapp..."
              className="bg-[#1a1a2e] border-[#2a2a4a] text-white"
            />
          </div>
          <div>
            <label className="text-sm text-gray-300 mb-1 block">Contenu README (optionnel)</label>
            <Textarea
              value={readmeContent}
              onChange={(e) => setReadmeContent(e.target.value)}
              placeholder="Collez le contenu du README.md ici..."
              className="bg-[#1a1a2e] border-[#2a2a4a] text-white min-h-[120px]"
            />
          </div>
          <Button
            onClick={handleScan}
            disabled={!projectName || scanning}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <Scan className="w-4 h-4 mr-2" />
                Scanner le projet
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Execute Dialog
// ============================================================

function ExecuteDialog({
  integration,
  func,
  open,
  onClose,
}: {
  integration: IntegrationConfig;
  func: IntegrationFunction;
  open: boolean;
  onClose: () => void;
}) {
  const [params, setParams] = useState('{}');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = async () => {
    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      const parsedParams = JSON.parse(params);
      const res = await fetch(`/api/integrations/${integration.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          functionId: func.id,
          params: parsedParams,
          userId: 'dashboard',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || 'Execution failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON parameters');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0d0d1a] border-[#2a2a4a] text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{integration.icon}</span>
            {func.displayName}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {func.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm text-gray-300 mb-1 block">Paramètres (JSON)</label>
            <Textarea
              value={params}
              onChange={(e) => setParams(e.target.value)}
              className="bg-[#1a1a2e] border-[#2a2a4a] text-white font-mono text-sm min-h-[120px]"
            />
          </div>
          <Button
            onClick={handleExecute}
            disabled={executing}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {executing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exécution...</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> Exécuter</>
            )}
          </Button>
          {result && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-xs text-green-400 mb-1">Résultat :</p>
              <pre className="text-xs text-gray-300 overflow-auto max-h-[200px]">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Main Integrations View
// ============================================================

export default function IntegrationsView() {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [stats, setStats] = useState<IntegrationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [executeDialog, setExecuteDialog] = useState<{
    integration: IntegrationConfig;
    func: IntegrationFunction;
  } | null>(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations');
      const data = await res.json();
      if (data.success) {
        setIntegrations(data.data.integrations);
        setStats(data.data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleActivate = async (id: string) => {
    try {
      const res = await fetch(`/api/integrations/${id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'dashboard' }),
      });
      if (res.ok) fetchIntegrations();
    } catch (error) {
      console.error('Activation failed:', error);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      const res = await fetch(`/api/integrations/${id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'dashboard', deactivate: true }),
      });
      if (res.ok) fetchIntegrations();
    } catch (error) {
      console.error('Deactivation failed:', error);
    }
  };

  const handleHealthCheck = async (id: string) => {
    try {
      await fetch(`/api/integrations/${id}/status`);
      fetchIntegrations();
    } catch (error) {
      console.error('Health check failed:', error);
    }
  };

  const handleScan = async (scanData: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/integrations/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanData),
      });
      if (res.ok) fetchIntegrations();
    } catch (error) {
      console.error('Scan failed:', error);
    }
  };

  const handleExecute = (_integrationId: string, func: IntegrationFunction) => {
    const integration = integrations.find(i => i.id === _integrationId);
    if (integration) {
      setExecuteDialog({ integration, func });
    }
  };

  // Filter integrations
  const filtered = integrations.filter((i) => {
    const matchesSearch = i.displayName.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase()) ||
      i.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || i.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-400" />
            Serveur d&apos;Intégration
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Analysez et intégrez des projets open-source dans Genova
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScanDialog onScan={handleScan} />
          <Button
            variant="outline"
            className="border-[#2a2a4a] text-gray-400 hover:text-white"
            onClick={fetchIntegrations}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-[#0d0d1a] border-[#2a2a4a]">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-2xl font-bold text-white">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d0d1a] border-[#2a2a4a]">
            <CardContent className="p-4">
              <p className="text-xs text-green-500">Actifs</p>
              <p className="text-2xl font-bold text-green-400">{stats.active}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d0d1a] border-[#2a2a4a]">
            <CardContent className="p-4">
              <p className="text-xs text-blue-500">Fonctions</p>
              <p className="text-2xl font-bold text-blue-400">{stats.totalFunctions}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d0d1a] border-[#2a2a4a]">
            <CardContent className="p-4">
              <p className="text-xs text-purple-500">Catégories</p>
              <p className="text-2xl font-bold text-purple-400">{stats.categories}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une intégration..."
            className="pl-9 bg-[#0d0d1a] border-[#2a2a4a] text-white"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px] bg-[#0d0d1a] border-[#2a2a4a] text-white">
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent className="bg-[#0d0d1a] border-[#2a2a4a]">
            <SelectItem value="all">Toutes les catégories</SelectItem>
            <SelectItem value="ai_ml">IA / ML</SelectItem>
            <SelectItem value="communication">Communication</SelectItem>
            <SelectItem value="automation">Automatisation</SelectItem>
            <SelectItem value="database">Base de données</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="infrastructure">Infrastructure</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Integration Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onActivate={handleActivate}
              onDeactivate={handleDeactivate}
              onHealthCheck={handleHealthCheck}
              onExecute={handleExecute}
            />
          ))}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Aucune intégration trouvée</p>
          <p className="text-gray-500 text-sm mt-1">Scannez un projet open-source pour commencer</p>
        </div>
      )}

      {/* Execute Dialog */}
      {executeDialog && (
        <ExecuteDialog
          integration={executeDialog.integration}
          func={executeDialog.func}
          open={!!executeDialog}
          onClose={() => setExecuteDialog(null)}
        />
      )}
    </div>
  );
}
