'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Check, Copy, Eye, EyeOff, Key, Plus, RefreshCw, Trash2, Shield } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string | null;
  scopes: string[];
}

const SCOPE_OPTIONS = [
  { value: 'agents:read', label: 'Lecture agents' },
  { value: 'agents:write', label: 'Écriture agents' },
  { value: 'agents:execute', label: 'Exécution agents' },
  { value: 'voice:call', label: 'Appels vocaux' },
  { value: 'messages:send', label: 'Envoi messages' },
  { value: 'billing:read', label: 'Lecture facturation' },
  { value: 'admin:read', label: 'Administration' },
];

// FIX « Failed to fetch keys » : jamais de réponse en cache (un service-worker ou
// un cache HTTP peut servir une réponse 412/erronée), cookies same-origin explicites,
// et un seul retry automatique sur 429/5xx avant de lâcher — le statut réel est
// exposé à l'utilisateur pour un diagnostic précis.
const API_FETCH_OPTIONS: RequestInit = {
  cache: 'no-store',
  credentials: 'same-origin',
};

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function fetchJson(url: string, init?: RequestInit, retries = 1, attempt = 0): Promise<Response> {
  const res = await fetch(url, { ...API_FETCH_OPTIONS, ...init });
  if (!res.ok && RETRYABLE_STATUS.has(res.status) && attempt < retries) {
    await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
    return fetchJson(url, init, retries, attempt + 1);
  }
  return res;
}

function describeFetchError(status: number, fallback: string): string {
  if (status === 429) return 'Trop de requêtes (429) — réessayez dans quelques secondes';
  if (status === 401) return 'Session non authentifiée (401) — reconnectez-vous';
  if (status === 403) return `Accès refusé (403) — statut: ${status}`;
  if (status >= 500) return `Erreur serveur (${status}) — réessayez dans un instant`;
  return `${fallback} (${status})`;
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(['agents:read', 'agents:execute']));
  const [showKey, setShowKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetchJson('/api/keys');
      if (!res.ok) throw new Error(describeFetchError(res.status, 'Failed to fetch keys'));
      const data = await res.json();
      setKeys(data.keys || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { let _cancelled = false; (async () => { if (!_cancelled) { try { await fetchKeys(); } catch {} } })(); return () => { _cancelled = true; }; }, [fetchKeys]);

  const toggleScope = (scope: string) => {
    setSelectedScopes(prev => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setError(null);
    try {
      const res = await fetchJson('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName, scopes: Array.from(selectedScopes) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data?.error) || describeFetchError(res.status, 'Failed to create key'));
      setNewlyCreatedKey(data.key);
      setNewKeyName('');
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Supprimer cette clé API ? Les services qui l\'utilisent seront coupés.')) return;
    try {
      const res = await fetchJson('/api/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(describeFetchError(res.status, 'Failed to delete key'));
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete key');
    }
  };

  const copyToClipboard = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return key;
    return key.substring(0, 4) + '•'.repeat(key.length - 8) + key.substring(key.length - 4);
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Clés API
          </CardTitle>
          <CardDescription>
            Gérez vos clés API pour accéder à Gen3ia via l&apos;API REST et MCP
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erreur</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-2">
                <span>{error}</span>
                <Button size="sm" variant="outline" onClick={() => { setLoading(true); fetchKeys(); }}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Réessayer
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {newlyCreatedKey && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <Check className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-700">Clé créée avec succès !</AlertTitle>
              <AlertDescription className="text-green-600">
                <p className="mb-2">Copiez votre clé maintenant. Elle ne sera plus jamais affichée.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-green-100 dark:bg-green-900 p-2 text-xs font-mono break-all">{newlyCreatedKey}</code>
                  <Button size="sm" variant="outline" onClick={() => { copyToClipboard(newlyCreatedKey); setNewlyCreatedKey(null); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Aucune clé API. Créez-en une pour commencer.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((apiKey) => (
                <div key={apiKey.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{apiKey.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs font-mono text-muted-foreground">
                        {showKey === apiKey.id ? apiKey.key : maskKey(apiKey.key)}
                      </code>
                      <button onClick={() => setShowKey(showKey === apiKey.id ? null : apiKey.id)} className="text-muted-foreground hover:text-foreground">
                        {showKey === apiKey.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => copyToClipboard(apiKey.key)} className="text-muted-foreground hover:text-foreground">
                        {copiedKey === apiKey.key ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {apiKey.scopes?.map((scope) => (
                        <Badge key={scope} variant="outline" className="text-[10px] h-5">
                          <Shield className="h-3 w-3 mr-1" />
                          {scope}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Créée le {new Date(apiKey.createdAt).toLocaleDateString('fr-FR')}
                      {apiKey.lastUsed ? ` · Dernière utilisation le ${new Date(apiKey.lastUsed).toLocaleDateString('fr-FR')}` : ' · Jamais utilisée'}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteKey(apiKey.id)} className="text-destructive hover:text-destructive ml-4">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex-col space-y-4 items-stretch">
          <div className="flex flex-col sm:flex-row w-full gap-4">
            <div className="flex-1">
              <Label htmlFor="key-name">Nom de la clé</Label>
              <Input id="key-name" placeholder="Ma clé API" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            </div>
            <div className="flex-1">
              <Label>Permissions</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {SCOPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => toggleScope(opt.value)}
                    className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                      selectedScopes.has(opt.value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center w-full gap-2">
            <span className="text-xs text-muted-foreground">{keys.length} clé{keys.length > 1 ? 's' : ''}</span>
            <Button onClick={createKey} disabled={!newKeyName.trim()} className="self-end">
              <Plus className="h-4 w-4 mr-2" />
              Créer la clé
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
