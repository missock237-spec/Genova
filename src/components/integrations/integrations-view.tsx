'use client';
import { useState, useEffect, useCallback } from 'react';
import { Puzzle, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface IntegrationItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  isConnected?: boolean;
}

export function IntegrationsView() {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<{ success: boolean; integrations: IntegrationItem[]; connected: string[] }>('/api/integrations');
      setIntegrations(Array.isArray(res?.integrations) ? res.integrations : []);
      setConnectedIds(Array.isArray(res?.connected) ? res.connected : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
      setIntegrations([]);
      setConnectedIds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const toggle = async (id: string, currentlyConnected: boolean) => {
    setTogglingId(id);
    try {
      await apiFetch(`/api/integrations/${id}/activate`, {
        method: 'POST',
        body: JSON.stringify({ deactivate: currentlyConnected }),
      });
      await fetchIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Integrations</h1><p className="text-muted-foreground">Connectez vos services</p></div>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  if (error && integrations.length === 0) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Integrations</h1><p className="text-muted-foreground">Connectez vos services</p></div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <h3 className="text-lg font-medium mb-1">Erreur de chargement</h3>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button onClick={fetchIntegrations} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">Reessayer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Integrations</h1><p className="text-muted-foreground">Connectez vos services</p></div>

      {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">{error}</div>}

      {integrations.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border">
          <Puzzle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Aucune integration</h3>
          <p className="text-sm text-muted-foreground">Aucune integration disponible</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map(i => {
            const isConnected = connectedIds.includes(i.id) || !!i.isConnected;
            const isToggling = togglingId === i.id;
            return (
              <div key={i.id} className="bg-card rounded-xl border p-5 hover:shadow-md">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Puzzle className="h-5 w-5 text-primary" /></div>
                  {isConnected ? <Check className="h-5 w-5 text-green-500" /> : <X className="h-5 w-5 text-muted-foreground" />}
                </div>
                <h3 className="font-semibold">{i.name}</h3>
                {i.description && <p className="text-xs text-muted-foreground mt-1">{i.description}</p>}
                <button
                  disabled={isToggling}
                  onClick={() => toggle(i.id, isConnected)}
                  className={`w-full mt-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 ${isConnected ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}
                >
                  {isToggling ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : isConnected ? 'Deconnecter' : 'Connecter'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
