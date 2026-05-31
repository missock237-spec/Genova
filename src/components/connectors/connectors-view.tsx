'use client';

/**
 * Connectors View — Genova SaaS
 *
 * Main dashboard for managing MCP Connectors and Access Keys.
 * Provides unified management of external service connections.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Plus, Search, Activity, CheckCircle2,
  XCircle, AlertTriangle, Loader2, Play, Trash2,
  Settings, Zap, Globe, ChevronDown, ChevronRight,
  Power, PowerOff, Key, Link2, TestTube, Shield,
  Server, Clock, ArrowRight, ExternalLink, Eye, EyeOff,
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

// ============================================================
// Types
// ============================================================

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface MCPConnectorData {
  id: string;
  name: string;
  description: string;
  serverUrl: string;
  transportType: string;
  status: string;
  authType: string;
  tools: MCPTool[];
  resources: Array<{ uri: string; name: string }>;
  prompts: Array<{ name: string; description?: string }>;
  serverInfo: { name?: string; version?: string };
  lastConnectedAt?: string;
  lastError?: string;
  requestCount: number;
  avgLatencyMs: number;
  isActive: boolean;
  createdAt: string;
}

interface AccessKeyData {
  id: string;
  name: string;
  description: string;
  service: string;
  keyType: string;
  endpoint?: string;
  scopes: string[];
  isActive: boolean;
  lastTestedAt?: string;
  lastTestResult?: { success: boolean; message: string; statusCode?: number; responseTimeMs: number };
  usageCount: number;
  expiresAt?: string;
  createdAt: string;
}

interface ServiceDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  defaultEndpoint?: string;
  defaultTestEndpoint?: string;
  defaultKeyType: string;
  defaultScopes: string[];
  category: string;
  description: string;
}

interface ConnectorStats {
  total: number;
  mcpConnectors: number;
  accessKeys: number;
  active: number;
  totalExecutions: number;
  byService: Record<string, number>;
}

// ============================================================
// Status Helpers
// ============================================================

const MCP_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  disconnected: { label: 'Déconnecté', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: <XCircle className="w-3 h-3" /> },
  connecting: { label: 'Connexion...', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  connected: { label: 'Connecté', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
  error: { label: 'Erreur', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <AlertTriangle className="w-3 h-3" /> },
};

const KEY_TYPE_LABELS: Record<string, string> = {
  api_key: 'Clé API',
  bearer_token: 'Token Bearer',
  oauth2: 'OAuth 2.0',
  basic_auth: 'Auth Basique',
  custom: 'Personnalisé',
};

const TRANSPORT_LABELS: Record<string, string> = {
  sse: 'SSE',
  'streamable-http': 'HTTP Streamable',
};

// ============================================================
// MCP Connector Card
// ============================================================

function MCPConnectorCard({
  connector,
  onConnect,
  onDisconnect,
  onDelete,
  onRefresh,
  onExecuteTool,
}: {
  connector: MCPConnectorData;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
  onExecuteTool: (connectorId: string, tool: MCPTool) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const statusConfig = MCP_STATUS_CONFIG[connector.status] || MCP_STATUS_CONFIG.disconnected;

  const handleConnect = async () => {
    setConnecting(true);
    await onConnect(connector.id);
    setConnecting(false);
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <Card className="bg-[#0d0d1a] border-[#2a2a4a] hover:border-[#3a3a5a] transition-all">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-purple-500/10">
                <Server className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-white text-base">{connector.name}</CardTitle>
                <CardDescription className="text-gray-400 text-xs mt-0.5">
                  MCP • {TRANSPORT_LABELS[connector.transportType] || connector.transportType}
                  {connector.serverInfo?.name && ` • ${connector.serverInfo.name}`}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={statusConfig.color}>
                {statusConfig.icon}
                <span className="ml-1">{statusConfig.label}</span>
              </Badge>
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-gray-400 text-sm mb-3 line-clamp-2">{connector.description}</p>

          <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {connector.tools.length} outils
            </span>
            <span className="flex items-center gap-1">
              <Globe className="w-3 h-3" />
              {connector.resources.length} ressources
            </span>
            {connector.avgLatencyMs > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {connector.avgLatencyMs}ms
              </span>
            )}
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3" />
              {connector.requestCount} requêtes
            </span>
          </div>

          <div className="flex items-center gap-2">
            {connector.status === 'connected' ? (
              <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => onDisconnect(connector.id)}>
                <PowerOff className="w-3 h-3 mr-1" /> Déconnecter
              </Button>
            ) : (
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleConnect} disabled={connecting}>
                {connecting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Power className="w-3 h-3 mr-1" />}
                Connecter
              </Button>
            )}
            {connector.status === 'connected' && (
              <Button size="sm" variant="outline" className="border-[#2a2a4a] text-gray-400 hover:text-white" onClick={() => onRefresh(connector.id)}>
                <RefreshCw className="w-3 h-3 mr-1" /> Rafraîchir
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 ml-auto" onClick={() => onDelete(connector.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>

          {/* Expanded: Tools, Resources */}
          <AnimatePresence>
            {expanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <Separator className="my-3 bg-[#2a2a4a]" />

                {connector.tools.length > 0 && (
                  <>
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Outils disponibles</h4>
                    <div className="space-y-2 mb-3">
                      {connector.tools.map((tool) => (
                        <div key={tool.name} className="flex items-center justify-between p-2 rounded-lg bg-[#1a1a2e] border border-[#2a2a4a]">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-white font-medium">{tool.name}</span>
                            {tool.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{tool.description}</p>}
                          </div>
                          {connector.status === 'connected' && (
                            <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 ml-2" onClick={() => onExecuteTool(connector.id, tool)}>
                              <Play className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {connector.resources.length > 0 && (
                  <>
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Ressources</h4>
                    <div className="space-y-1 mb-3">
                      {connector.resources.map((r) => (
                        <div key={r.uri} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-[#1a1a2e] border border-[#2a2a4a]">
                          <Globe className="w-3 h-3 text-blue-400 flex-shrink-0" />
                          <span className="text-white truncate">{r.name}</span>
                          <span className="text-gray-500 truncate ml-auto">{r.uri}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {connector.lastError && (
                  <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {connector.lastError}
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
// Access Key Card
// ============================================================

function AccessKeyCard({
  accessKey,
  onTest,
  onDelete,
  onToggle,
  services,
}: {
  accessKey: AccessKeyData;
  onTest: (id: string) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  services: ServiceDef[];
}) {
  const [testing, setTesting] = useState(false);
  const service = services.find(s => s.id === accessKey.service);

  const handleTest = async () => {
    setTesting(true);
    await onTest(accessKey.id);
    setTesting(false);
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <Card className="bg-[#0d0d1a] border-[#2a2a4a] hover:border-[#3a3a5a] transition-all">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: `${service?.color || '#6b7280'}20` }}>
                {service?.icon || '🔧'}
              </div>
              <div>
                <CardTitle className="text-white text-base">{accessKey.name}</CardTitle>
                <CardDescription className="text-gray-400 text-xs mt-0.5">
                  {service?.name || accessKey.service} • {KEY_TYPE_LABELS[accessKey.keyType] || accessKey.keyType}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={accessKey.isActive} onCheckedChange={(checked) => onToggle(accessKey.id, checked)} />
              {accessKey.lastTestResult && (
                <Badge variant="outline" className={accessKey.lastTestResult.success ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
                  {accessKey.lastTestResult.success ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-gray-400 text-sm mb-3 line-clamp-2">{accessKey.description || service?.description}</p>

          {accessKey.scopes.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {accessKey.scopes.slice(0, 5).map((scope) => (
                <Badge key={scope} variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400">
                  {scope}
                </Badge>
              ))}
              {accessKey.scopes.length > 5 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-500/30 text-gray-400">
                  +{accessKey.scopes.length - 5}
                </Badge>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3" />
              {accessKey.usageCount} utilisations
            </span>
            {accessKey.lastTestResult?.responseTimeMs !== undefined && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {accessKey.lastTestResult.responseTimeMs}ms
              </span>
            )}
            {accessKey.expiresAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Expire: {new Date(accessKey.expiresAt).toLocaleDateString('fr-FR')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10" onClick={handleTest} disabled={testing || !accessKey.isActive}>
              {testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <TestTube className="w-3 h-3 mr-1" />}
              Tester
            </Button>
            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 ml-auto" onClick={() => onDelete(accessKey.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>

          {accessKey.lastTestResult && !accessKey.lastTestResult.success && (
            <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {accessKey.lastTestResult.message}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ============================================================
// Add MCP Connector Dialog
// ============================================================

function AddMCPDialog({ onAdd }: { onAdd: (data: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [transportType, setTransportType] = useState('sse');
  const [authType, setAuthType] = useState('none');
  const [authConfig, setAuthConfig] = useState<Record<string, string>>({});

  const handleAdd = async () => {
    if (!name || !serverUrl) return;
    onAdd({ connectorType: 'mcp', name, serverUrl, transportType, authType, authConfig });
    setOpen(false);
    setName('');
    setServerUrl('');
    setTransportType('sse');
    setAuthType('none');
    setAuthConfig({});
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-purple-600 hover:bg-purple-700 text-white">
          <Server className="w-4 h-4 mr-2" /> Ajouter MCP
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0d0d1a] border-[#2a2a4a] text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Connecteur MCP</DialogTitle>
          <DialogDescription className="text-gray-400">
            Connectez Genova à un serveur MCP (Model Context Protocol)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm text-gray-300 mb-1 block">Nom *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: GitHub MCP, Slack MCP..." className="bg-[#1a1a2e] border-[#2a2a4a] text-white" />
          </div>
          <div>
            <Label className="text-sm text-gray-300 mb-1 block">URL du serveur *</Label>
            <Input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://mcp-server.example.com/sse" className="bg-[#1a1a2e] border-[#2a2a4a] text-white" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-gray-300 mb-1 block">Transport</Label>
              <Select value={transportType} onValueChange={setTransportType}>
                <SelectTrigger className="bg-[#1a1a2e] border-[#2a2a4a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d0d1a] border-[#2a2a4a]">
                  <SelectItem value="sse">SSE</SelectItem>
                  <SelectItem value="streamable-http">HTTP Streamable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-gray-300 mb-1 block">Authentification</Label>
              <Select value={authType} onValueChange={setAuthType}>
                <SelectTrigger className="bg-[#1a1a2e] border-[#2a2a4a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d0d1a] border-[#2a2a4a]">
                  <SelectItem value="none">Aucune</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="api_key">Clé API</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                  <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {authType === 'bearer' && (
            <div>
              <Label className="text-sm text-gray-300 mb-1 block">Token Bearer</Label>
              <Input type="password" onChange={(e) => setAuthConfig(prev => ({ ...prev, token: e.target.value }))} placeholder="Votre token..." className="bg-[#1a1a2e] border-[#2a2a4a] text-white" />
            </div>
          )}
          {authType === 'api_key' && (
            <div className="space-y-3">
              <div>
                <Label className="text-sm text-gray-300 mb-1 block">Nom du header</Label>
                <Input onChange={(e) => setAuthConfig(prev => ({ ...prev, headerName: e.target.value }))} placeholder="X-API-Key" className="bg-[#1a1a2e] border-[#2a2a4a] text-white" />
              </div>
              <div>
                <Label className="text-sm text-gray-300 mb-1 block">Clé API</Label>
                <Input type="password" onChange={(e) => setAuthConfig(prev => ({ ...prev, apiKey: e.target.value }))} placeholder="Votre clé..." className="bg-[#1a1a2e] border-[#2a2a4a] text-white" />
              </div>
            </div>
          )}
          {authType === 'basic' && (
            <div className="space-y-3">
              <div>
                <Label className="text-sm text-gray-300 mb-1 block">Nom d&apos;utilisateur</Label>
                <Input onChange={(e) => setAuthConfig(prev => ({ ...prev, username: e.target.value }))} className="bg-[#1a1a2e] border-[#2a2a4a] text-white" />
              </div>
              <div>
                <Label className="text-sm text-gray-300 mb-1 block">Mot de passe</Label>
                <Input type="password" onChange={(e) => setAuthConfig(prev => ({ ...prev, password: e.target.value }))} className="bg-[#1a1a2e] border-[#2a2a4a] text-white" />
              </div>
            </div>
          )}
          <Button onClick={handleAdd} disabled={!name || !serverUrl} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
            <Link2 className="w-4 h-4 mr-2" /> Créer le connecteur
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Add Access Key Dialog
// ============================================================

function AddAccessKeyDialog({ services, onAdd }: { services: ServiceDef[]; onAdd: (data: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [service, setService] = useState('');
  const [keyType, setKeyType] = useState('api_key');
  const [keyValue, setKeyValue] = useState('');
  const [showKey, setShowKey] = useState(false);

  const selectedService = services.find(s => s.id === service);

  const handleAdd = async () => {
    if (!name || !service || !keyValue) return;
    onAdd({
      connectorType: 'access_key',
      name,
      service,
      keyType: keyType || selectedService?.defaultKeyType || 'api_key',
      keyValue,
      endpoint: selectedService?.defaultEndpoint,
      testEndpoint: selectedService?.defaultTestEndpoint,
      scopes: selectedService?.defaultScopes || [],
    });
    setOpen(false);
    setName('');
    setService('');
    setKeyType('api_key');
    setKeyValue('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <Key className="w-4 h-4 mr-2" /> Ajouter Clé
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0d0d1a] border-[#2a2a4a] text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Clé d&apos;accès</DialogTitle>
          <DialogDescription className="text-gray-400">
            Ajoutez une clé API ou un token pour connecter Genova à un service externe
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm text-gray-300 mb-1 block">Nom *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Clé Stripe Production..." className="bg-[#1a1a2e] border-[#2a2a4a] text-white" />
          </div>
          <div>
            <Label className="text-sm text-gray-300 mb-1 block">Service *</Label>
            <Select value={service} onValueChange={(v) => {
              setService(v);
              const svc = services.find(s => s.id === v);
              if (svc) setKeyType(svc.defaultKeyType);
            }}>
              <SelectTrigger className="bg-[#1a1a2e] border-[#2a2a4a] text-white">
                <SelectValue placeholder="Sélectionnez un service" />
              </SelectTrigger>
              <SelectContent className="bg-[#0d0d1a] border-[#2a2a4a] max-h-[300px]">
                {services.map((svc) => (
                  <SelectItem key={svc.id} value={svc.id}>
                    <span className="flex items-center gap-2">
                      <span>{svc.icon}</span>
                      <span>{svc.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedService && <p className="text-xs text-gray-500 mt-1">{selectedService.description}</p>}
          </div>
          <div>
            <Label className="text-sm text-gray-300 mb-1 block">Type de clé</Label>
            <Select value={keyType} onValueChange={setKeyType}>
              <SelectTrigger className="bg-[#1a1a2e] border-[#2a2a4a] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0d0d1a] border-[#2a2a4a]">
                <SelectItem value="api_key">Clé API</SelectItem>
                <SelectItem value="bearer_token">Token Bearer</SelectItem>
                <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                <SelectItem value="basic_auth">Auth Basique</SelectItem>
                <SelectItem value="custom">Personnalisé</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm text-gray-300 mb-1 block">Valeur de la clé *</Label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder="Votre clé ou token..."
                className="bg-[#1a1a2e] border-[#2a2a4a] text-white pr-10"
              />
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="w-3.5 h-3.5 text-gray-400" /> : <Eye className="w-3.5 h-3.5 text-gray-400" />}
              </Button>
            </div>
          </div>
          {selectedService?.defaultScopes && selectedService.defaultScopes.length > 0 && (
            <div>
              <Label className="text-sm text-gray-300 mb-1 block">Scopes disponibles</Label>
              <div className="flex flex-wrap gap-1">
                {selectedService.defaultScopes.map((scope) => (
                  <Badge key={scope} variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400">{scope}</Badge>
                ))}
              </div>
            </div>
          )}
          <Button onClick={handleAdd} disabled={!name || !service || !keyValue} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            <Shield className="w-4 h-4 mr-2" /> Ajouter la clé
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Execute MCP Tool Dialog
// ============================================================

function ExecuteToolDialog({
  connectorId,
  tool,
  open,
  onClose,
}: {
  connectorId: string;
  tool: MCPTool;
  open: boolean;
  onClose: () => void;
}) {
  const [args, setArgs] = useState('{}');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = async () => {
    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      const parsedArgs = JSON.parse(args);
      const res = await fetch(`/api/connectors/mcp/${connectorId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: tool.name, args: parsedArgs }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(JSON.stringify(data.data, null, 2));
      } else {
        setError(data.error || 'Exécution échouée');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paramètres JSON invalides');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0d0d1a] border-[#2a2a4a] text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>{tool.name}</DialogTitle>
          <DialogDescription className="text-gray-400">{tool.description || 'Exécuter cet outil MCP'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm text-gray-300 mb-1 block">Arguments (JSON)</Label>
            <Textarea value={args} onChange={(e) => setArgs(e.target.value)} className="bg-[#1a1a2e] border-[#2a2a4a] text-white font-mono text-sm min-h-[120px]" />
          </div>
          <Button onClick={handleExecute} disabled={executing} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            {executing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exécution...</> : <><Play className="w-4 h-4 mr-2" /> Exécuter</>}
          </Button>
          {result && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-xs text-green-400 mb-1">Résultat :</p>
              <pre className="text-xs text-gray-300 overflow-auto max-h-[200px]">{result}</pre>
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
// Main Connectors View
// ============================================================

export default function ConnectorsView() {
  const [activeTab, setActiveTab] = useState('mcp');
  const [mcpConnectors, setMcpConnectors] = useState<MCPConnectorData[]>([]);
  const [accessKeys, setAccessKeys] = useState<AccessKeyData[]>([]);
  const [services, setServices] = useState<ServiceDef[]>([]);
  const [stats, setStats] = useState<ConnectorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [executeDialog, setExecuteDialog] = useState<{ connectorId: string; tool: MCPTool } | null>(null);

  const fetchMCPConnectors = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors/mcp');
      const data = await res.json();
      if (data.success) setMcpConnectors(data.data.connectors);
    } catch (error) {
      console.error('Failed to fetch MCP connectors:', error);
    }
  }, []);

  const fetchAccessKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors/keys');
      const data = await res.json();
      if (data.success) {
        setAccessKeys(data.data.keys);
        setServices(data.data.services || []);
      }
    } catch (error) {
      console.error('Failed to fetch access keys:', error);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors');
      const data = await res.json();
      if (data.success) setStats(data.data.stats);
    } catch (error) {
      console.error('Failed to fetch connector stats:', error);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchMCPConnectors(), fetchAccessKeys(), fetchStats()]);
    setLoading(false);
  }, [fetchMCPConnectors, fetchAccessKeys, fetchStats]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAddConnector = async (data: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) fetchAll();
    } catch (error) {
      console.error('Failed to add connector:', error);
    }
  };

  const handleConnect = async (id: string) => {
    try {
      await fetch(`/api/connectors/mcp/${id}/connect`, { method: 'POST' });
      fetchMCPConnectors();
    } catch (error) {
      console.error('Connect failed:', error);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await fetch(`/api/connectors/mcp/${id}/disconnect`, { method: 'POST' });
      fetchMCPConnectors();
    } catch (error) {
      console.error('Disconnect failed:', error);
    }
  };

  const handleDeleteMCP = async (id: string) => {
    if (!confirm('Supprimer ce connecteur MCP ?')) return;
    try {
      await fetch(`/api/connectors/mcp/${id}`, { method: 'DELETE' });
      fetchAll();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleRefresh = async (id: string) => {
    try {
      await fetch(`/api/connectors/mcp/${id}/refresh`, { method: 'POST' });
      fetchMCPConnectors();
    } catch (error) {
      console.error('Refresh failed:', error);
    }
  };

  const handleTestKey = async (id: string) => {
    try {
      await fetch(`/api/connectors/keys/${id}/test`, { method: 'POST' });
      fetchAccessKeys();
    } catch (error) {
      console.error('Test failed:', error);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Supprimer cette clé d\'accès ?')) return;
    try {
      await fetch(`/api/connectors/keys/${id}`, { method: 'DELETE' });
      fetchAll();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleToggleKey = async (id: string, isActive: boolean) => {
    try {
      await fetch(`/api/connectors/keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      fetchAccessKeys();
    } catch (error) {
      console.error('Toggle failed:', error);
    }
  };

  const filteredMCP = mcpConnectors.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.serverUrl.toLowerCase().includes(search.toLowerCase())
  );

  const filteredKeys = accessKeys.filter(k =>
    !search || k.name.toLowerCase().includes(search.toLowerCase()) || k.service.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Link2 className="w-6 h-6 text-purple-400" />
            Connecteurs
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Connectez Genova à des services externes via MCP ou clés d&apos;accès
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddMCPDialog onAdd={handleAddConnector} />
          <AddAccessKeyDialog services={services} onAdd={handleAddConnector} />
          <Button variant="outline" className="border-[#2a2a4a] text-gray-400 hover:text-white" onClick={fetchAll}>
            <RefreshCw className="w-4 h-4 mr-2" /> Actualiser
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-[#0d0d1a] border-[#2a2a4a]">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-2xl font-bold text-white">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d0d1a] border-[#2a2a4a]">
            <CardContent className="p-4">
              <p className="text-xs text-purple-500">MCP</p>
              <p className="text-2xl font-bold text-purple-400">{stats.mcpConnectors}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d0d1a] border-[#2a2a4a]">
            <CardContent className="p-4">
              <p className="text-xs text-blue-500">Clés d&apos;accès</p>
              <p className="text-2xl font-bold text-blue-400">{stats.accessKeys}</p>
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
              <p className="text-xs text-yellow-500">Exécutions</p>
              <p className="text-2xl font-bold text-yellow-400">{stats.totalExecutions}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un connecteur..." className="pl-9 bg-[#0d0d1a] border-[#2a2a4a] text-white" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[#0d0d1a] border border-[#2a2a4a]">
          <TabsTrigger value="mcp" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            <Server className="w-4 h-4 mr-2" /> MCP ({filteredMCP.length})
          </TabsTrigger>
          <TabsTrigger value="keys" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Key className="w-4 h-4 mr-2" /> Clés d&apos;accès ({filteredKeys.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
            Tous ({filteredMCP.length + filteredKeys.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mcp" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filteredMCP.map((connector) => (
                <MCPConnectorCard
                  key={connector.id}
                  connector={connector}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onDelete={handleDeleteMCP}
                  onRefresh={handleRefresh}
                  onExecuteTool={(id, tool) => setExecuteDialog({ connectorId: id, tool })}
                />
              ))}
            </AnimatePresence>
          </div>
          {filteredMCP.length === 0 && (
            <div className="text-center py-12">
              <Server className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Aucun connecteur MCP</p>
              <p className="text-gray-500 text-sm mt-1">Ajoutez un serveur MCP pour commencer</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="keys" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filteredKeys.map((key) => (
                <AccessKeyCard
                  key={key.id}
                  accessKey={key}
                  onTest={handleTestKey}
                  onDelete={handleDeleteKey}
                  onToggle={handleToggleKey}
                  services={services}
                />
              ))}
            </AnimatePresence>
          </div>
          {filteredKeys.length === 0 && (
            <div className="text-center py-12">
              <Key className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Aucune clé d&apos;accès</p>
              <p className="text-gray-500 text-sm mt-1">Ajoutez une clé API ou token pour commencer</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filteredMCP.map((connector) => (
                <MCPConnectorCard
                  key={`mcp-${connector.id}`}
                  connector={connector}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onDelete={handleDeleteMCP}
                  onRefresh={handleRefresh}
                  onExecuteTool={(id, tool) => setExecuteDialog({ connectorId: id, tool })}
                />
              ))}
              {filteredKeys.map((key) => (
                <AccessKeyCard
                  key={`ak-${key.id}`}
                  accessKey={key}
                  onTest={handleTestKey}
                  onDelete={handleDeleteKey}
                  onToggle={handleToggleKey}
                  services={services}
                />
              ))}
            </AnimatePresence>
          </div>
          {filteredMCP.length === 0 && filteredKeys.length === 0 && (
            <div className="text-center py-12">
              <Link2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Aucun connecteur</p>
              <p className="text-gray-500 text-sm mt-1">Ajoutez un connecteur MCP ou une clé d&apos;accès</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Execute Tool Dialog */}
      {executeDialog && (
        <ExecuteToolDialog
          connectorId={executeDialog.connectorId}
          tool={executeDialog.tool}
          open={!!executeDialog}
          onClose={() => setExecuteDialog(null)}
        />
      )}
    </div>
  );
}
